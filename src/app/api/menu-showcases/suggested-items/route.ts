import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getCurrentMonthlySalesImport } from '@/lib/monthly-sales-import'
import { buildCostedMenuItems, buildImportedSalesByItem } from '@/lib/monthly-sales-derived'
import { buildContextShowcaseSuggestions } from '@/lib/context-showcase-ranking'

export const dynamic = 'force-dynamic'

type Slot = 'breakfast' | 'day' | 'evening' | 'night'

/** Get time slot for a date in tz: breakfast 6–10, day 10–19, evening 19–24, night 0–6. */
function getTimeSlotForDate(date: Date, tz: string): Slot {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(date),
    10
  )
  if (hour >= 6 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 19) return 'day'
  if (hour >= 19 && hour < 24) return 'evening'
  return 'night'
}

/**
 * GET ?mode=profit|adaptive
 * Returns suggested carousel item IDs: { recommended, breakfast, day, evening, night: string[] }
 * Each array max 6 items, ordered high price to lowest.
 * Profit: high-margin mains + shareables first, then fill from other high-margin non-drink items.
 * Adaptive: top 6 by margin + popularity in that slot (or high-margin fallback when no sales), then sort by price desc.
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

    const [restaurant, menuItems, salesLast30d] = await Promise.all([
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
      prisma.sale.findMany({
        where: { restaurantId, timestamp: { gte: thirtyDaysAgo } },
        include: { items: true },
      }),
    ])

    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    const timezone = (settings.menuTimezone as string) || restaurant?.timezone || 'Asia/Baghdad'
    const importedSales = getCurrentMonthlySalesImport(settings)

    const salesByItem = new Map<string, { quantity: number; costSum: number }>()
    const unitsBySlot = new Map<string, Record<Slot, number>>()
    if (importedSales) {
      const importedByItem = buildImportedSalesByItem(importedSales, buildCostedMenuItems(menuItems))
      for (const [menuItemId, value] of Array.from(importedByItem.entries())) {
        salesByItem.set(menuItemId, { quantity: value.quantity, costSum: value.costSum })
        unitsBySlot.set(menuItemId, {
          breakfast: 0,
          day: value.quantity,
          evening: 0,
          night: 0,
        })
      }
    } else {
      for (const sale of salesLast30d) {
        const slot = getTimeSlotForDate(sale.timestamp, timezone)
        for (const si of sale.items) {
          const cur = salesByItem.get(si.menuItemId) ?? { quantity: 0, costSum: 0 }
          cur.quantity += si.quantity
          cur.costSum += (si.cost ?? 0) * si.quantity
          salesByItem.set(si.menuItemId, cur)
          const slotMap = unitsBySlot.get(si.menuItemId) ?? { breakfast: 0, day: 0, evening: 0, night: 0 }
          slotMap[slot] += si.quantity
          unitsBySlot.set(si.menuItemId, slotMap)
        }
      }
    }

    const rawItems = menuItems.map((item: any) => {
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
        description: item.description ?? null,
        tags: item.tags ?? [],
        marginPercent,
        totalUnitsSold: unitsSold,
        slotUnits: unitsBySlot.get(item.id) ?? { breakfast: 0, day: 0, evening: 0, night: 0 },
        price: item.price ?? 0,
      }
    })
    return NextResponse.json(buildContextShowcaseSuggestions(rawItems, mode))
  } catch (error) {
    console.error('Error fetching suggested carousel items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch suggested items' },
      { status: 500 }
    )
  }
}
