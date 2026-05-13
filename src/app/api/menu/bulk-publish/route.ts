import { getServerSession } from 'next-auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publicMenuDataCacheTag } from '@/lib/public-menu-cache-tags'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { ids, publishAll } = body

    let targetIds: string[] = []

    if (publishAll) {
      // Find all draft items for this restaurant
      const drafts = await prisma.menuItem.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          status: 'DRAFT'
        },
        select: { id: true }
      })
      targetIds = drafts.map(d => d.id)
    } else {
      targetIds = Array.isArray(ids)
        ? Array.from(new Set<string>(ids.filter((id: any) => typeof id === 'string' && id.trim().length > 0)))
        : []
    }

    if (targetIds.length === 0) {
      return NextResponse.json(
        { error: 'No draft items to publish.' },
        { status: 400 }
      )
    }

    const updateResult = await prisma.menuItem.updateMany({
      where: {
        id: { in: targetIds },
        restaurantId: session.user.restaurantId,
      },
      data: {
        status: 'ACTIVE'
      }
    })

    // Revalidate caches
    revalidatePath('/')
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { slug: true },
    })
    if (restaurant?.slug) {
      revalidatePath(`/${restaurant.slug}`)
      revalidateTag(publicMenuDataCacheTag(restaurant.slug))
    }

    return NextResponse.json({
      success: true,
      publishedCount: updateResult.count,
    })
  } catch (error: any) {
    console.error('Error bulk publishing menu items:', error)
    return NextResponse.json(
      { error: 'Failed to publish selected menu items' },
      { status: 500 }
    )
  }
}
