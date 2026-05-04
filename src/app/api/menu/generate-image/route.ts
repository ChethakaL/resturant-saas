import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/platform-config'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  ImageOrientation,
  ImageSizePreset,
} from '@/lib/image-format'
import { enforceImageDimensions } from '@/lib/image-processor'
import { postToImageModel } from '@/lib/retryable-image-api'
import { sanitizeErrorForClient } from '@/lib/sanitize-error'
import { buildIserveGenerationPrompt } from '@/lib/iserve-image-prompts'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      prompt,
      useSavedDefaults = false,
      itemName,
      description,
      category,
      notes,
      useIserveStandards = false,
      orientation = 'landscape',
      sizePreset = 'medium',
    }: {
      prompt?: string | null
      useSavedDefaults?: boolean
      itemName?: string
      description?: string
      category?: string
      notes?: string
      useIserveStandards?: boolean
      orientation?: ImageOrientation
      sizePreset?: ImageSizePreset
    } = await request.json()

    if (!(await getPlatformConfig()).geminiApiKey && !((await getPlatformConfig()).geminiApiKey ?? process.env.GOOGLE_AI_KEY)) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

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
    const effectivePrompt =
      useSavedDefaults
        ? savedDefaults?.defaultBackgroundPrompt?.trim() ?? ''
        : prompt?.trim() ?? ''
    const backgroundReferenceImageData =
      useSavedDefaults ? savedDefaults?.defaultBackgroundImageData ?? '' : ''

    let imagePrompt = ''
    const requestParts: Array<Record<string, unknown>> = []

    if (useIserveStandards) {
      imagePrompt = buildIserveGenerationPrompt({
        itemName,
        category,
        description,
        notes,
      }).prompt
      requestParts.push({ text: imagePrompt })
    } else {
      const dishPart =
        itemName?.trim() || 'the dish'
      const dishDescription = [
        dishPart,
        category?.trim() ? `(${category})` : '',
        description?.trim() ? `: ${description}` : '',
      ]
        .filter(Boolean)
        .join(' ')

      const corePrompt = `Professional food photography of ${dishDescription}. One dish only, fully visible. CLOSE-UP: the plate and food must FILL the frame (about 80-90% of the image)—little empty table. Do NOT draw the dish small in the middle of empty space. A pizza = large pizza that nearly fills the image; not a mini pizza. CRITICAL: Plate ON the table; no gap, no floating. High-quality, appetizing, photorealistic.`

      const stylePart =
        effectivePrompt
          ? ` Background and styling (apply to the dish above): ${effectivePrompt}.`
          : ''
      const backgroundImagePart = backgroundReferenceImageData.trim()
        ? ' Match the provided reference background image exactly (surface, lighting direction, style, mood). Do not add extra background objects/props and do not change the reference background look.'
          : ''

      imagePrompt = `${corePrompt}${stylePart}${backgroundImagePart}`
      requestParts.push({ text: imagePrompt })
    }

    if (!useIserveStandards && backgroundReferenceImageData.trim()) {
      const bgBase64Data = backgroundReferenceImageData.includes(',')
        ? backgroundReferenceImageData.split(',')[1]
        : backgroundReferenceImageData
      const bgMime = backgroundReferenceImageData.includes(',')
        ? backgroundReferenceImageData.split(',')[0].split(':')[1].split(';')[0]
        : 'image/jpeg'
      requestParts.push({
        inlineData: {
          mimeType: bgMime?.startsWith('image/') ? bgMime : 'image/jpeg',
          data: bgBase64Data,
        },
      })
    }

    console.log('Generating image with image model:', imagePrompt.slice(0, 200) + '…')

    const response = await postToImageModel(((await getPlatformConfig()).geminiApiKey ?? process.env.GOOGLE_AI_KEY), {
      contents: [
        {
          parts: [
            ...requestParts,
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['image'],
        temperature: 1,
        topK: 40,
        topP: 0.95,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('AI image API error:', errorText)
      throw new Error(`AI image service error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log('Full AI image response:', JSON.stringify(data, null, 2))

    // Extract the image data from the response
    const candidates = data.candidates
    if (!candidates || candidates.length === 0) {
      console.error('No candidates in response:', JSON.stringify(data, null, 2))
      return NextResponse.json(
        { error: 'No image generated by AI', details: JSON.stringify(data) },
        { status: 500 }
      )
    }

    if (!candidates[0].content || !candidates[0].content.parts) {
      console.error('Invalid candidate structure:', JSON.stringify(candidates[0], null, 2))
      return NextResponse.json(
        { error: 'Invalid response structure from AI', details: JSON.stringify(candidates[0]) },
        { status: 500 }
      )
    }

    const responseParts = candidates[0].content.parts as any[]
    let imageBase64: string | null = null
    let imageMimeType: string = 'image/png'

    // Find the image in the response parts
    for (const part of responseParts) {
      if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
        imageBase64 = part.inlineData.data
        imageMimeType = part.inlineData.mimeType
        break
      }
    }

    if (!imageBase64) {
      // If no inline data, check if there's a text response with error
      const textResponse = responseParts.find((p: any) => p.text)?.text
      console.error('No image data found. Response:', JSON.stringify(responseParts, null, 2))
      return NextResponse.json(
        {
          error: 'No image data found in response',
          details: textResponse || 'AI did not return image data'
        },
        { status: 500 }
      )
    }

    // Return as data URL (same as marketing-tool approach)
    const processed = await enforceImageDimensions(
      imageBase64,
      orientation,
      sizePreset
    )
    const imageDataUrl = `data:${processed.mimeType};base64,${processed.base64}`

    console.log('Image generated successfully')

    return NextResponse.json({
      success: true,
      imageUrl: imageDataUrl,
      prompt: imagePrompt,
    })
  } catch (error) {
    console.error('Error generating image:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate image',
        details: sanitizeErrorForClient(error instanceof Error ? error.message : 'Unknown error')
      },
      { status: 500 }
    )
  }
}
