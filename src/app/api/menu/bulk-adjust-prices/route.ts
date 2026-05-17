import { getServerSession } from 'next-auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publicMenuDataCacheTag } from '@/lib/public-menu-cache-tags'

const MAX_SELECTED_IDS = 200
const MIN_PERCENT = -99
const MAX_PERCENT = 500

function roundMenuPrice(price: number): number {
  return Math.round(price)
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const percentChange = Number(body?.percentChange)
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
    const categoryId =
      typeof body?.categoryId === 'string' && body.categoryId.trim().length > 0
        ? body.categoryId.trim()
        : null
    const applyToAll = body?.applyToAll === true

    if (!Number.isFinite(percentChange) || percentChange === 0) {
      return NextResponse.json(
        { error: 'Enter a non-zero percentage (e.g. 10 for +10%, -5 for -5%).' },
        { status: 400 }
      )
    }

    if (percentChange < MIN_PERCENT || percentChange > MAX_PERCENT) {
      return NextResponse.json(
        { error: `Percentage must be between ${MIN_PERCENT} and ${MAX_PERCENT}.` },
        { status: 400 }
      )
    }

    const targets = [ids.length > 0, Boolean(categoryId), applyToAll].filter(Boolean)
    if (targets.length !== 1) {
      return NextResponse.json(
        { error: 'Specify exactly one scope: selected items, a category, or all items.' },
        { status: 400 }
      )
    }

    if (ids.length > MAX_SELECTED_IDS) {
      return NextResponse.json(
        { error: `You can adjust up to ${MAX_SELECTED_IDS} selected items at once.` },
        { status: 400 }
      )
    }

    const restaurantId = session.user.restaurantId
    const multiplier = 1 + percentChange / 100

    let where: { restaurantId: string; id?: { in: string[] }; categoryId?: string } = {
      restaurantId,
    }

    if (ids.length > 0) {
      where = { restaurantId, id: { in: ids } }
    } else if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, restaurantId },
        select: { id: true },
      })
      if (!category) {
        return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
      }
      where = { restaurantId, categoryId }
    }

    const items = await prisma.menuItem.findMany({
      where,
      select: { id: true, price: true },
    })

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No menu items found for this adjustment.' },
        { status: 404 }
      )
    }

    const updates = items.map((item) => ({
      id: item.id,
      price: Math.max(0, roundMenuPrice(item.price * multiplier)),
    }))

    await prisma.$transaction(
      updates.map((item) =>
        prisma.menuItem.update({
          where: { id: item.id },
          data: { price: item.price },
        })
      )
    )

    revalidatePath('/')
    revalidatePath('/menu')
    revalidatePath('/dashboard/menu')
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true },
    })
    if (restaurant?.slug) {
      revalidatePath(`/${restaurant.slug}`)
      revalidateTag(publicMenuDataCacheTag(restaurant.slug))
    }

    return NextResponse.json({
      success: true,
      updatedCount: updates.length,
      percentChange,
    })
  } catch (error) {
    console.error('Error bulk adjusting menu prices:', error)
    return NextResponse.json(
      { error: 'Failed to adjust menu prices' },
      { status: 500 }
    )
  }
}
