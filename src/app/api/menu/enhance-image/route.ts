import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/platform-config'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { enhanceDishImage } from '@/lib/enhance-dish-image'
import type { ImageOrientation, ImageSizePreset } from '@/lib/image-format'
import { prisma } from '@/lib/prisma'
import {
  enhanceDishWithLockedBackground,
  composeDishOnLockedBackgroundStrict,
  StrictBackgroundLockError,
} from '@/lib/locked-background-hybrid'
import { sanitizeErrorForClient } from '@/lib/sanitize-error'
import { postToImageModel } from '@/lib/retryable-image-api'
import { enforceImageDimensions } from '@/lib/image-processor'
import {
  buildIserveEnhancementPrompt,
  IserveEnhancementBackgroundMode,
  IserveQualityLevel,
} from '@/lib/iserve-image-prompts'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      imageData,
      prompt,
      useSavedDefaults = false,
      useIserveStandards = false,
      itemName,
      description,
      category,
      notes,
      qualityLevel = 'premium',
      backgroundMode = 'soft_bokeh',
      orientation = 'landscape',
      sizePreset = 'medium',
    }: {
      imageData?: string
      prompt?: string
      useSavedDefaults?: boolean
      useIserveStandards?: boolean
      itemName?: string
      description?: string
      category?: string
      notes?: string
      qualityLevel?: IserveQualityLevel
      backgroundMode?: IserveEnhancementBackgroundMode
      orientation?: ImageOrientation
      sizePreset?: ImageSizePreset
    } = await request.json()
    if (!imageData) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      )
    }

    const dishPayloadSize = typeof imageData === 'string' ? imageData.length : 0
    console.log('[enhance-image] Request: useSavedDefaults=%s, orientation=%s, sizePreset=%s, dishPayloadLength=%d', useSavedDefaults, orientation, sizePreset, dishPayloadSize)

    const originalMime = imageData.includes(',')
      ? imageData.split(',')[0].split(':')[1].split(';')[0]
      : 'image/jpeg'

    if (useIserveStandards) {
      const apiKey = ((await getPlatformConfig()).geminiApiKey ?? process.env.GOOGLE_AI_KEY)
      if (!apiKey) {
        return NextResponse.json({ error: 'Google AI API key not configured' }, { status: 500 })
      }

      const promptText = buildIserveEnhancementPrompt({
        itemName,
        category,
        description,
        qualityLevel,
        backgroundMode,
        notes,
      }).prompt

      const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData
      const mimeType = originalMime?.startsWith('image/') ? originalMime : 'image/jpeg'
      const response = await postToImageModel(apiKey, {
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: promptText },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['image'],
          temperature: 0.2,
          topK: 16,
          topP: 0.8,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`AI image service error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      const parts = data.candidates?.[0]?.content?.parts as Array<Record<string, any>> | undefined
      const imagePart = parts?.find((part) => part.inlineData?.mimeType?.startsWith('image/'))
      if (!imagePart?.inlineData?.data) {
        throw new Error('No image data in AI response')
      }

      const processed = await enforceImageDimensions(imagePart.inlineData.data, orientation, sizePreset)
      return NextResponse.json({
        success: true,
        imageUrl: `data:${processed.mimeType};base64,${processed.base64}`,
        originalMimeType: originalMime,
        prompt: promptText,
      })
    }

    const customPrompt = (prompt || '').trim()
    const savedDefaults =
      useSavedDefaults && session.user.id
        ? await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
              defaultBackgroundPrompt: true,
              defaultBackgroundImageData: true,
            },
          })
        : null
    const effectivePrompt = useSavedDefaults
      ? savedDefaults?.defaultBackgroundPrompt?.trim() ?? ''
      : customPrompt
    const backgroundReferenceImageData = useSavedDefaults
      ? savedDefaults?.defaultBackgroundImageData ?? ''
      : ''

    const hasRefImage = Boolean(backgroundReferenceImageData?.trim())
    const refImageLength = backgroundReferenceImageData?.length ?? 0
    console.log('[enhance-image] Saved defaults: hasRefImage=%s, refImageLength=%d, effectivePromptLength=%d', hasRefImage, refImageLength, (effectivePrompt ?? '').length)

    // When user has a reference background: use hybrid (composite + AI harmonization) so the dish is blended in professionally, not pasted. Raw paste is only used if STRICT_BACKGROUND_LOCK=true and hybrid is off.
    const useHybrid =
      useSavedDefaults &&
      Boolean(backgroundReferenceImageData.trim()) &&
      process.env.ENABLE_LOCKED_BACKGROUND_HYBRID !== 'false'
    const useStrictPaste =
      useSavedDefaults &&
      Boolean(backgroundReferenceImageData.trim()) &&
      process.env.STRICT_BACKGROUND_LOCK === 'true' &&
      !useHybrid

    console.log('[enhance-image] Path: useHybrid=%s, useStrictPaste=%s, env HYBRID=%s, env STRICT=%s', useHybrid, useStrictPaste, process.env.ENABLE_LOCKED_BACKGROUND_HYBRID, process.env.STRICT_BACKGROUND_LOCK)

    let dataUrl: string
    if (useHybrid) {
      console.log('[enhance-image] Using hybrid (composite + harmonize)')
      try {
        const result = await enhanceDishWithLockedBackground({
          dishImageData: imageData,
          backgroundImageData: backgroundReferenceImageData,
          userPrompt: effectivePrompt,
          orientation,
          sizePreset,
        })
        dataUrl = result.dataUrl
        console.log('[enhance-image] Hybrid success, result length=%d', result.dataUrl?.length ?? 0)
      } catch (hybridError) {
        console.warn('[enhance-image] Hybrid background harmonization failed, falling back to AI enhancement.', hybridError)
        const standard = await enhanceDishImage({
          imageData,
          userPrompt: effectivePrompt,
          backgroundReferenceImageData,
          orientation,
          sizePreset,
        })
        dataUrl = standard.dataUrl
      }
    } else if (useStrictPaste) {
      console.log('[enhance-image] Using strict paste (raw composite)')
      try {
        const strict = await composeDishOnLockedBackgroundStrict({
          dishImageData: imageData,
          backgroundImageData: backgroundReferenceImageData,
          orientation,
          sizePreset,
        })
        dataUrl = strict.dataUrl
      } catch (strictError) {
        console.warn('Strict background lock failed.', strictError)
        if (strictError instanceof StrictBackgroundLockError) {
          return NextResponse.json(
            {
              error: 'Could not lock dish into background with this photo',
              details: strictError.message,
              strictBackgroundLock: true,
              code: strictError.code,
            },
            { status: 422 }
          )
        }
        return NextResponse.json(
          {
            error: 'Strict background lock failed',
            details: strictError instanceof Error ? strictError.message : 'Unknown error',
            strictBackgroundLock: true,
          },
          { status: 422 }
        )
      }
    } else {
      console.log('[enhance-image] Using standard AI enhancement (no reference or no saved defaults)')
      const standard = await enhanceDishImage({
        imageData,
        userPrompt: effectivePrompt,
        backgroundReferenceImageData,
        orientation,
        sizePreset,
      })
      dataUrl = standard.dataUrl
    }

    console.log('[enhance-image] Success, returning imageUrl length=%d', dataUrl?.length ?? 0)
    return NextResponse.json({
      success: true,
      imageUrl: dataUrl,
      originalMimeType: originalMime,
    })
  } catch (error) {
    console.error('[enhance-image] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to enhance image',
        details: sanitizeErrorForClient(error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 500 }
    )
  }
}
