import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enhanceDishImage } from '@/lib/enhance-dish-image'
import { getImageBufferFromS3IfOurs } from '@/lib/s3-get-image'
import { enhanceDishWithLockedBackground } from '@/lib/locked-background-hybrid'
import { checkDishImageQuality } from '@/lib/dish-image-quality-check'
import { sanitizeErrorForClient } from '@/lib/sanitize-error'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId || !session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      select: { id: true, imageUrl: true },
    })
    if (!menuItem) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }
    const imageUrl = menuItem.imageUrl?.trim()
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Menu item has no image to update' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { defaultBackgroundPrompt: true, defaultBackgroundImageData: true },
    })
    const defaultPrompt = user?.defaultBackgroundPrompt?.trim() ?? ''
    const defaultBackgroundImageData = user?.defaultBackgroundImageData ?? ''

    let imageData: string
    if (imageUrl.startsWith('data:')) {
      imageData = imageUrl
    } else {
      const s3Result = await getImageBufferFromS3IfOurs(imageUrl).catch(() => null)
      if (s3Result) {
        const base64 = s3Result.buffer.toString('base64')
        imageData = `data:${s3Result.contentType};base64,${base64}`
      } else {
        const res = await fetch(imageUrl)
        if (!res.ok) {
          return NextResponse.json(
            { error: 'Failed to fetch current image. If it is an S3 URL, the bucket may be in a different account or region.' },
            { status: 502 }
          )
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const base64 = buf.toString('base64')
        const contentType = res.headers.get('content-type') || 'image/jpeg'
        imageData = `data:${contentType};base64,${base64}`
      }
    }

    const hasReferenceBackground = Boolean(defaultBackgroundImageData.trim())
    const hasQualityChecker = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)

    let dataUrl: string

    if (hasReferenceBackground) {
      // Pure AI: send dish + background to Gemini, get a menu photo back
      const result = await enhanceDishWithLockedBackground({
        dishImageData: imageData,
        backgroundImageData: defaultBackgroundImageData,
        userPrompt: defaultPrompt,
      })
      dataUrl = result.dataUrl

      // Quality check — if BAD, retry once with the feedback
      if (hasQualityChecker) {
        try {
          const quality = await checkDishImageQuality(dataUrl)
          if (quality && quality.quality === 'BAD') {
            console.log('[apply-background] quality check BAD: %s — retrying', quality.reason)
            const retry = await enhanceDishWithLockedBackground({
              dishImageData: imageData,
              backgroundImageData: defaultBackgroundImageData,
              userPrompt: defaultPrompt,
              fixInstructionsFromAnalysis: quality.reason,
            })
            dataUrl = retry.dataUrl
          }
        } catch {
          // Quality check failed — keep the first result
        }
      }
    } else {
      const result = await enhanceDishImage({
        imageData,
        userPrompt: defaultPrompt,
        backgroundReferenceImageData: defaultBackgroundImageData,
      })
      dataUrl = result.dataUrl
    }

    // Always save the Gemini data URL to the menu item (no S3 upload)
    await prisma.menuItem.update({
      where: { id: params.id },
      data: { imageUrl: dataUrl },
    })

    revalidatePath('/menu')
    revalidatePath('/')

    return NextResponse.json({ success: true, imageUrl: dataUrl })
  } catch (error) {
    console.error('Apply background error:', error)
    return NextResponse.json(
      {
        error: 'Failed to apply background to dish photo',
        details: sanitizeErrorForClient(error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 500 }
    )
  }
}
