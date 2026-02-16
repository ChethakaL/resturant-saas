import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { classifyItemType, type DefaultCategoryKey } from '@/lib/category-suggest'
import type { ItemForSuggest } from '@/lib/category-suggest'

export const dynamic = 'force-dynamic'

const MAX_CAROUSEL_ITEMS = 3
type Slot = 'day' | 'evening' | 'night'

/** Get time slot for a date in tz (day 6–12, evening 12–18, night 18–6). */
function getTimeSlotForDate(date: Date, tz: string): Slot {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(date),
    10
  )
  if (hour >= 6 && hour < 12) return 'day'
  if (hour >= 12 && hour < 18) return 'evening'
  return 'night'
}

/**
 * GET ?mode=profit|adaptive
 * Returns suggested carousel item IDs per time slot: { day: string[], evening: string[], night: string[] }
 * Each array max 3 items, ordered high price to lowest.
 * Profit: 2 high-margin mains + 1 high-margin shareable (same for all slots).
 * Adaptive: top 3 by margin + popularity in that slot, then sort by price desc.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') === 'adaptive' ? 'adaptive' : 'profit'

    const restaurantId = session.user.restaurantId
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [restaurant, menuItems, categories, salesLast30d] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { settings: true, timezone: true },
      }),
      prisma.menuItem.findMany({
        where: { available: true, restaurantId },
        include: {
          category: true,
          ingredients: { include: { ingredient: true } },
        },
      }) as Promise<any[]>,
      prisma.category.findMany({
        where: { restaurantId },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.sale.findMany({
        where: { restaurantId, timestamp: { gte: thirtyDaysAgo } },
        include: { items: true },
      }),
    ])

    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    const timezone = (settings.menuTimezone as string) || restaurant?.timezone || 'Asia/Baghdad'

    const salesByItem = new Map<string, { quantity: number; costSum: number }>()
    const unitsBySlot = new Map<string, Record<Slot, number>>()
    for (const sale of salesLast30d) {
      const slot = getTimeSlotForDate(sale.timestamp, timezone)
      for (const si of sale.items) {
        const cur = salesByItem.get(si.menuItemId) ?? { quantity: 0, costSum: 0 }
        cur.quantity += si.quantity
        cur.costSum += (si.cost ?? 0) * si.quantity
        salesByItem.set(si.menuItemId, cur)
        const slotMap = unitsBySlot.get(si.menuItemId) ?? { day: 0, evening: 0, night: 0 }
        slotMap[slot] += si.quantity
        unitsBySlot.set(si.menuItemId, slotMap)
      }
    }

    const itemsForSuggest: (ItemForSuggest & { price: number })[] = menuItems.map((item: any) => {
      const ingredientTotal = item.ingredients?.reduce(
        (sum: number, ing: any) => sum + ing.quantity * ing.ingredient.costPerUnit,
        0
      ) ?? 0
      const marginPercent =
        item.price > 0 ? ((item.price - ingredientTotal) / item.price) * 100 : 0
      const agg = salesByItem.get(item.id)
      const unitsSold = agg?.quantity ?? 0
      return {
        id: item.id,
        name: item.name,
        categoryName: item.category?.name ?? null,
        marginPercent,
        unitsSold,
        price: item.price ?? 0,
      }
    })

    const byPriceDesc = (ids: string[]) => {
      const map = new Map(itemsForSuggest.map((i) => [i.id, i.price]))
      return [...ids].sort((a, b) => (map.get(b) ?? 0) - (map.get(a) ?? 0))
    }

    if (mode === 'profit') {
      const mains = itemsForSuggest.filter((i) => classifyItemType(i) === 'Main Dishes')
      const shareables = itemsForSuggest.filter((i) => classifyItemType(i) === 'Shareables')
      mains.sort((a, b) => b.marginPercent - a.marginPercent || b.price - a.price)
      shareables.sort((a, b) => b.marginPercent - a.marginPercent || b.price - a.price)
      const selected: string[] = []
      for (const item of mains) {
        if (selected.length >= MAX_CAROUSEL_ITEMS) break
        selected.push(item.id)
      }
      for (const item of shareables) {
        if (selected.length >= MAX_CAROUSEL_ITEMS) break
        if (!selected.includes(item.id)) selected.push(item.id)
      }
      return NextResponse.json({
        day: byPriceDesc(selected),
        evening: byPriceDesc(selected),
        night: byPriceDesc(selected),
      })
    }

    const SCORE_WEIGHT_MARGIN = 0.6
    const SCORE_WEIGHT_POPULARITY = 0.4
    const score = (item: ItemForSuggest & { price: number }, slot: Slot) => {
      const pop = unitsBySlot.get(item.id)?.[slot] ?? 0
      return item.marginPercent * SCORE_WEIGHT_MARGIN + Math.min(100, pop) * SCORE_WEIGHT_POPULARITY
    }
    const prioritizeForSlot = (
      sorted: (ItemForSuggest & { price: number })[]
    ): string[] => {
      const priority: DefaultCategoryKey[] = [
        'Main Dishes',
        'Shareables',
        'Add-ons',
        'Drinks',
        'Desserts',
        'Kids',
        'Sides',
      ]
      const result: string[] = []
      const seen = new Set<string>()
      const addItem = (item: ItemForSuggest & { price: number }) => {
        if (result.length >= MAX_CAROUSEL_ITEMS) return
        if (seen.has(item.id)) return
        result.push(item.id)
        seen.add(item.id)
      }
      for (const type of priority) {
        for (const item of sorted) {
          if (classifyItemType(item) === type) {
            addItem(item)
            if (result.length >= MAX_CAROUSEL_ITEMS) break
          }
        }
        if (result.length >= MAX_CAROUSEL_ITEMS) break
      }
      for (const item of sorted) {
        addItem(item)
        if (result.length >= MAX_CAROUSEL_ITEMS) break
      }
      return byPriceDesc(result)
    }
    const result: Record<Slot, string[]> = { day: [], evening: [], night: [] }
    for (const slot of ['day', 'evening', 'night'] as const) {
      const sorted = [...itemsForSuggest].sort((a, b) => score(b, slot) - score(a, slot))
      result[slot] = prioritizeForSlot(sorted)
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching suggested carousel items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch suggested items' },
      { status: 500 }
    )
  }
}
