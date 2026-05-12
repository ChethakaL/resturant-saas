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
    const ids: string[] = Array.isArray(body?.ids)
      ? Array.from(
          new Set<string>(
            body.ids.filter(
              (id: unknown): id is string =>
                typeof id === 'string' && id.trim().length > 0
            )
          )
        )
      : []

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one menu item to delete.' },
        { status: 400 }
      )
    }

    const ownedItems = await prisma.menuItem.findMany({
      where: {
        id: { in: ids },
        restaurantId: session.user.restaurantId,
      },
      select: { id: true },
    })
    const ownedIds = ownedItems.map((item) => item.id)

    if (ownedIds.length === 0) {
      return NextResponse.json(
        { error: 'No matching menu items found.' },
        { status: 404 }
      )
    }

    const deleteResult = await prisma.menuItem.deleteMany({
      where: {
        id: { in: ownedIds },
        restaurantId: session.user.restaurantId,
      },
    })

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
      deletedCount: deleteResult.count,
      deletedIds: ownedIds,
    })
  } catch (error: any) {
    console.error('Error bulk deleting menu items:', error)

    if (error.code === 'P2003') {
      return NextResponse.json(
        {
          error:
            'Cannot delete selected items because one or more are referenced by other records.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to delete selected menu items' },
      { status: 500 }
    )
  }
}
