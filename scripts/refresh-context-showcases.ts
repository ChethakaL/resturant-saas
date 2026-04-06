import { PrismaClient } from '@prisma/client'
import { buildContextShowcaseSuggestions } from '@/lib/context-showcase-ranking'

type Slot = 'breakfast' | 'day' | 'evening' | 'night'

const prisma = new PrismaClient()

function getTimeSlotForDate(date: Date, tz: string): Slot {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(date),
    10
  )
  if (hour >= 6 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 14) return 'day'
  if (hour >= 14 && hour < 18) return 'evening'
  return 'night'
}

async function main() {
  const restaurantRef = process.argv[2]
  if (!restaurantRef) {
    throw new Error('Usage: npx tsx scripts/refresh-context-showcases.ts <restaurant-slug-or-id>')
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: {
      OR: [{ id: restaurantRef }, { slug: restaurantRef.toLowerCase() }],
    },
    select: { id: true, slug: true, name: true, timezone: true, settings: true },
  })

  if (!restaurant) throw new Error(`Restaurant not found: ${restaurantRef}`)

  const settings = (restaurant.settings as Record<string, unknown> | null) || {}
  const timezone = (settings.menuTimezone as string) || restaurant.timezone || 'Asia/Baghdad'
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [menuItems, sales, showcases] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, available: true },
      include: {
        category: true,
        ingredients: { include: { ingredient: true } },
      },
    }),
    prisma.sale.findMany({
      where: { restaurantId: restaurant.id, timestamp: { gte: thirtyDaysAgo } },
      include: { items: true },
    }),
    prisma.menuShowcase.findMany({
      where: { restaurantId: restaurant.id },
      include: { items: true },
      orderBy: { displayOrder: 'asc' },
    }),
  ])

  const salesByItem = new Map<string, { quantity: number; costSum: number }>()
  const unitsBySlot = new Map<string, Record<Slot, number>>()
  for (const sale of sales) {
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

  const rawItems = menuItems.map((item) => {
    const ingredientTotal =
      item.ingredients?.reduce((sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit, 0) ?? 0
    const marginPercent = item.price > 0 ? ((item.price - ingredientTotal) / item.price) * 100 : 0
    const agg = salesByItem.get(item.id)
    return {
      id: item.id,
      name: item.name,
      categoryName: item.category?.name ?? null,
      description: item.description ?? null,
      tags: item.tags ?? [],
      marginPercent,
      totalUnitsSold: agg?.quantity ?? 0,
      slotUnits: unitsBySlot.get(item.id) ?? { breakfast: 0, day: 0, evening: 0, night: 0 },
      price: item.price ?? 0,
    }
  })

  const suggestions = buildContextShowcaseSuggestions(rawItems, 'profit')
  const definitions = [
    {
      title: "Chef's recommendation for breakfast",
      schedule: { displayForSlot: 'breakfast' },
      itemIds: suggestions.breakfast,
    },
    {
      title: "Chef's recommendation for lunch",
      schedule: { displayForSlots: ['day', 'evening'] },
      itemIds: suggestions.lunch,
    },
    {
      title: "Chef's recommendation for dinner",
      schedule: { displayForSlot: 'night' },
      itemIds: suggestions.dinner,
    },
    {
      title: "Chef's recommendation for a hot day",
      schedule: { label: 'Hot Day', temperatureFeels: ['hot', 'warm'], weatherLabels: ['clear', 'partly-cloudy', 'cloudy'] },
      itemIds: suggestions.hotDay,
    },
    {
      title: "Chef's recommendation for a rainy day",
      schedule: { label: 'Rainy Day', weatherLabels: ['rain', 'storm'] },
      itemIds: suggestions.rainyDay,
    },
    {
      title: "Chef's recommendation for a cold day",
      schedule: { label: 'Cold Day', temperatureFeels: ['cold', 'cool'] },
      itemIds: suggestions.coldDay,
    },
  ] as const

  let nextDisplayOrder = showcases.reduce((max, showcase) => Math.max(max, showcase.displayOrder ?? 0), 0) + 1

  for (const definition of definitions) {
    const existing = showcases.find((showcase) => showcase.title === definition.title)
    const showcase =
      existing ??
      (await prisma.menuShowcase.create({
        data: {
          restaurantId: restaurant.id,
          title: definition.title,
          type: 'CHEFS_HIGHLIGHTS',
          displayVariant: 'hero',
          position: 'top',
          displayOrder: nextDisplayOrder++,
          schedule: definition.schedule,
        },
        include: { items: true },
      }))

    await prisma.menuShowcase.update({
      where: { id: showcase.id },
      data: {
        type: 'CHEFS_HIGHLIGHTS',
        displayVariant: 'hero',
        position: 'top',
        isActive: true,
        schedule: definition.schedule,
      },
    })

    await prisma.menuShowcaseItem.deleteMany({ where: { showcaseId: showcase.id } })
    if (definition.itemIds.length > 0) {
      await prisma.menuShowcaseItem.createMany({
        data: definition.itemIds.map((menuItemId, index) => ({
          showcaseId: showcase.id,
          menuItemId,
          displayOrder: index + 1,
        })),
      })
    }

    const chosenNames = definition.itemIds
      .map((id) => rawItems.find((item) => item.id === id)?.name ?? id)
      .join(' | ')
    console.log(`${definition.title}: ${chosenNames}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
