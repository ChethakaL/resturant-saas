import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enhanceDishImage } from '@/lib/enhance-dish-image'
import { getImageBufferFromS3IfOurs } from '@/lib/s3-get-image'
import {
  enhanceDishWithLockedBackground,
  composeDishOnLockedBackgroundStrict,
  StrictBackgroundLockError,
} from '@/lib/locked-background-hybrid'
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

    const useHybrid =
      Boolean(defaultBackgroundImageData.trim()) &&
      process.env.ENABLE_LOCKED_BACKGROUND_HYBRID !== 'false'
    const useStrictPaste =
      Boolean(defaultBackgroundImageData.trim()) &&
      process.env.STRICT_BACKGROUND_LOCK === 'true' &&
      !useHybrid

    let dataUrl: string
    if (useHybrid) {
      try {
        const result = await enhanceDishWithLockedBackground({
          dishImageData: imageData,
          backgroundImageData: defaultBackgroundImageData,
          userPrompt: defaultPrompt,
        })
        dataUrl = result.dataUrl
      } catch (hybridError) {
        console.warn('Hybrid harmonization failed in apply-background, using AI enhancement.', hybridError)
        const standard = await enhanceDishImage({
          imageData,
          userPrompt: defaultPrompt,
          backgroundReferenceImageData: defaultBackgroundImageData,
        })
        dataUrl = standard.dataUrl
      }
    } else if (useStrictPaste) {
      try {
        const strict = await composeDishOnLockedBackgroundStrict({
          dishImageData: imageData,
          backgroundImageData: defaultBackgroundImageData,
        })
        dataUrl = strict.dataUrl
      } catch (strictError) {
        console.warn('Strict background lock failed in apply-background.', strictError)
        if (strictError instanceof StrictBackgroundLockError) {
        return NextResponse.json(
          {
            error: 'Could not lock dish into background with this photo',
            details: sanitizeErrorForClient(strictError.message),
              strictBackgroundLock: true,
              code: strictError.code,
            },
            { status: 422 }
          )
        }
        return NextResponse.json(
          {
            error: 'Strict background lock failed',
            details: sanitizeErrorForClient(strictError instanceof Error ? strictError.message : 'Unknown error'),
            strictBackgroundLock: true,
          },
          { status: 422 }
        )
      }
    } else {
      const standard = await enhanceDishImage({
        imageData,
        userPrompt: defaultPrompt,
        backgroundReferenceImageData: defaultBackgroundImageData,
      })
      dataUrl = standard.dataUrl
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
