import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enhanceDishImage } from '@/lib/enhance-dish-image'
import { getImageBufferFromS3IfOurs } from '@/lib/s3-get-image'

/**
 * POST /api/menu/preview-background
 * Uses one of your existing dish photos and re-renders only the background
 * with the given prompt. Returns the preview image (data URL) without saving.
 * Body: { prompt: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        restaurantId: session.user.restaurantId,
        imageUrl: { not: null },
      },
      select: { id: true, imageUrl: true },
    })

    if (!menuItem?.imageUrl?.trim()) {
      return NextResponse.json(
        { error: 'No dish photos to preview. Add at least one menu item with a photo.' },
        { status: 400 }
      )
    }

    const imageUrl = menuItem.imageUrl.trim()
    let imageData: string
    if (imageUrl.startsWith('data:')) {
      imageData = imageUrl
    } else {
      const s3Result = await getImageBufferFromS3IfOurs(imageUrl).catch(() => null)
      if (s3Result) {
        const base64 = s3Result.buffer.toString('base64')
        imageData = `data:${s3Result.contentType};base64,${base64}`
      } else {
        let res: Response
        try {
          res = await fetch(imageUrl, {
            headers: { 'User-Agent': 'RestaurantSaaS/1.0' },
            signal: AbortSignal.timeout(15000),
          })
        } catch (fetchErr) {
          console.error('Preview background fetch image error:', fetchErr)
          return NextResponse.json(
            {
              error: 'Could not load dish image. The image URL may be invalid, private, or unreachable.',
              details: fetchErr instanceof Error ? fetchErr.message : 'Network error',
            },
            { status: 502 }
          )
        }
        if (!res.ok) {
          return NextResponse.json(
            {
              error: 'Dish image could not be loaded (e.g. URL private or expired). Try re-uploading the photo for that item.',
              details: `HTTP ${res.status}`,
            },
            { status: 502 }
          )
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const base64 = buf.toString('base64')
        const contentType = res.headers.get('content-type') || 'image/jpeg'
        imageData = `data:${contentType};base64,${base64}`
      }
    }

    const { dataUrl } = await enhanceDishImage({
      imageData,
      userPrompt: prompt,
    })

    return NextResponse.json({ imageUrl: dataUrl })
  } catch (error) {
    console.error('Preview background error:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate preview',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
