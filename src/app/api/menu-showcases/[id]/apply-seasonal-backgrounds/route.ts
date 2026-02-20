import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enhanceDishImage } from '@/lib/enhance-dish-image'
import { getImageBufferFromS3IfOurs } from '@/lib/s3-get-image'
import { revalidatePath } from 'next/cache'

/**
 * The background scene description used for EVERY dish. Keeping this identical
 * across all items is what makes the backgrounds look consistent.
 */
const CHRISTMAS_BACKGROUND_PROMPT =
  'Place this dish on a rustic wooden table decorated with Christmas holly leaves, ' +
  'red berries, pine cones, and sprigs of pine. Warm golden bokeh lights and soft ' +
  'candlelight fill the background. Festive red and gold tones, cozy restaurant ' +
  'atmosphere. Professional food photography. The dish itself must remain completely ' +
  'unchanged — same food, same plate, same presentation. Only the background and ' +
  'table surface change.'

/**
 * POST /api/menu-showcases/[id]/apply-seasonal-backgrounds
 *
 * For each item in the carousel that has an image, calls enhanceDishImage with
 * the exact same Christmas background prompt so all results look consistent.
 * Results are stored as  seasonalItemImages: { [itemId]: dataUrl }  in the
 * showcase schedule JSON.
 *
 * Body: { prompt?: string }  — override the default prompt if supplied.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prompt } = (await request.json().catch(() => ({}))) as { prompt?: string }
    const backgroundPrompt = prompt?.trim() || CHRISTMAS_BACKGROUND_PROMPT

    const showcase = await prisma.menuShowcase.findFirst({
      where: { id: params.id, restaurantId: session.user.restaurantId },
      include: {
        items: {
          include: {
            menuItem: { select: { id: true, imageUrl: true, name: true } },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
    })

    if (!showcase) {
      return NextResponse.json({ error: 'Showcase not found' }, { status: 404 })
    }

    const seasonalItemImages: Record<string, string> = {}
    const errors: string[] = []

    for (const showcaseItem of showcase.items) {
      const item = showcaseItem.menuItem
      if (!item?.imageUrl) continue

      try {
        let imageData: string
        const imageUrl = item.imageUrl.trim()

        if (imageUrl.startsWith('data:')) {
          imageData = imageUrl
        } else {
          const s3Result = await getImageBufferFromS3IfOurs(imageUrl).catch(() => null)
          if (s3Result) {
            imageData = `data:${s3Result.contentType};base64,${s3Result.buffer.toString('base64')}`
          } else {
            const res = await fetch(imageUrl)
            if (!res.ok) {
              errors.push(`${item.name}: failed to fetch image`)
              continue
            }
            const buf = Buffer.from(await res.arrayBuffer())
            const contentType = res.headers.get('content-type') || 'image/jpeg'
            imageData = `data:${contentType};base64,${buf.toString('base64')}`
          }
        }

        const { dataUrl } = await enhanceDishImage({
          imageData,
          userPrompt: backgroundPrompt,
          orientation: 'landscape',
          sizePreset: 'medium',
        })

        seasonalItemImages[item.id] = dataUrl
      } catch (err) {
        errors.push(`${item.name}: ${err instanceof Error ? err.message : 'unknown error'}`)
      }
    }

    if (Object.keys(seasonalItemImages).length === 0) {
      return NextResponse.json(
        { error: 'No images could be processed', details: errors },
        { status: 422 }
      )
    }

    // Merge into existing schedule — keep seasonalBackgroundUrl if set, add/replace seasonalItemImages
    const existingSchedule = (showcase.schedule as Record<string, unknown>) || {}
    const newSchedule = { ...existingSchedule, seasonalItemImages }

    await prisma.menuShowcase.update({
      where: { id: params.id },
      data: { schedule: newSchedule },
    })

    revalidatePath('/')

    return NextResponse.json({
      success: true,
      count: Object.keys(seasonalItemImages).length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('apply-seasonal-backgrounds error:', error)
    return NextResponse.json(
      { error: 'Failed to apply seasonal backgrounds', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

/**
 * DELETE — clear the seasonalItemImages (and seasonalBackgroundUrl) from the
 * showcase schedule.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const showcase = await prisma.menuShowcase.findFirst({
      where: { id: params.id, restaurantId: session.user.restaurantId },
    })
    if (!showcase) {
      return NextResponse.json({ error: 'Showcase not found' }, { status: 404 })
    }

    const existingSchedule = (showcase.schedule as Record<string, unknown>) || {}
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { seasonalItemImages: _a, seasonalBackgroundUrl: _b, ...rest } = existingSchedule
    await prisma.menuShowcase.update({
      where: { id: params.id },
      data: { schedule: rest },
    })

    revalidatePath('/')
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear seasonal images', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
