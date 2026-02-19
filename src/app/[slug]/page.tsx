import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { MenuPersonalizationWrapper } from '@/components/customer/MenuPersonalizationWrapper'
import { runMenuEngine } from '@/lib/menu-engine'
import type { EngineMenuItem, EngineCategory, CoPurchasePair } from '@/lib/menu-engine'
import { getSettingsForMode } from '@/lib/menu-engine-defaults'
import type { MenuEngineSettings } from '@/types/menu-engine'
import type { EngineMode } from '@/types/menu-engine'
import { suggestCarouselItems, getTimeSlotLabel } from '@/lib/carousel-ai'
import type { CarouselMenuItem } from '@/lib/carousel-ai'
import { generateMenuDescription } from '@/lib/menu-description-ai'

// Revalidate on every request for DB data; AI carousel suggestions cached 5 min to avoid slow Gemini on every load
export const revalidate = 0

const CAROUSEL_CACHE_SECONDS = 300 // 5 min

/** Cached AI carousel suggestion so the page doesn't wait on Gemini every request */
async function getCachedCarouselSuggestions(
  restaurantId: string,
  timeSlotLabel: string,
  pool: CarouselMenuItem[]
): Promise<string[]> {
  const poolKey = pool.map((i) => i.id).sort().join(',')
  return unstable_cache(
    () => suggestCarouselItems(pool, timeSlotLabel as 'Morning' | 'Lunch' | 'Evening' | 'Night', { maxItems: 16 }),
    [`carousel-ai`, restaurantId, timeSlotLabel, poolKey],
    { revalidate: CAROUSEL_CACHE_SECONDS }
  )()
}

/** Breakfast 6–10, Day 10–14, Evening 14–18, Night 18–6 (local time in tz). */
function getCurrentTimeSlot(tz: string): 'breakfast' | 'day' | 'evening' | 'night' {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()),
    10
  )
  if (hour >= 6 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 14) return 'day'
  if (hour >= 14 && hour < 18) return 'evening'
  return 'night'
}

/** Get time slot for a given date in tz (for aggregating sales by slot). */
function getTimeSlotForDate(date: Date, tz: string): 'breakfast' | 'day' | 'evening' | 'night' {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(date),
    10
  )
  if (hour >= 6 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 14) return 'day'
  if (hour >= 14 && hour < 18) return 'evening'
  return 'night'
}

async function getMenuData(slug: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: slug.toLowerCase() },
  })

  if (!restaurant) {
    return null
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const [menuItems, chefPicks, showcases, categories, salesLast30d, preppedStocksRows, salesToday, tables] =
    await prisma.$transaction([
      prisma.menuItem.findMany({
        where: { available: true, status: 'ACTIVE', restaurantId: restaurant.id },
        include: {
          category: true,
          ingredients: { include: { ingredient: true } },
          addOns: { include: { addOn: true } },
        },
        orderBy: { price: 'asc' },
      }),

      prisma.chefPick.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { displayOrder: 'asc' },
      }),

      prisma.menuShowcase.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
        orderBy: { displayOrder: 'asc' },
        include: {
          items: {
            orderBy: { displayOrder: 'asc' },
            include: { menuItem: true },
          },
        },
      }),

      prisma.category.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { displayOrder: 'asc' },
      }),

      prisma.sale.findMany({
        where: { restaurantId: restaurant.id, timestamp: { gte: thirtyDaysAgo } },
        include: { items: true },
      }),

      prisma.preppedDishStock.findMany({
        where: { restaurantId: restaurant.id },
        select: { menuItemId: true, availableQuantity: true },
      }),

      prisma.sale.findMany({
        where: { restaurantId: restaurant.id, timestamp: { gte: todayStart } },
        include: { items: true },
      }),

      prisma.table.findMany({
        where: { restaurantId: restaurant.id },
        select: { id: true, number: true },
        orderBy: { number: 'asc' },
      }),
    ])

  const visibleCategoryIds = new Set(
    categories.filter((c: { showOnMenu?: boolean }) => c.showOnMenu !== false).map((c: { id: string }) => c.id)
  )
  const categoriesForMenu = categories.filter((c: { showOnMenu?: boolean }) => c.showOnMenu !== false)

  const chefPickOrderById = new Map(
    chefPicks.map((pick) => [pick.menuItemId, pick.displayOrder])
  )

  const menuItemsInVisibleCategories = menuItems.filter((item: any) => visibleCategoryIds.has(item.categoryId))

  // Compute a featured score for each item (server-only, never sent to client)
  const enrichedMenuItems = menuItemsInVisibleCategories.map((item: any) => {
    const ingredientTotal = item.ingredients.reduce(
      (sum: number, ing: any) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    const _featuredScore =
      item.price > 0
        ? ((item.price - ingredientTotal) / item.price) * 100
        : 0

    const { ingredients, addOns: menuItemAddOns, ...rest } = item
    return {
      ...rest,
      _featuredScore,
      chefPickOrder: chefPickOrderById.get(item.id) ?? null,
      updatedAt: item.updatedAt.toISOString(),
      addOns: menuItemAddOns
        .filter((ma: any) => ma.addOn.available)
        .map((ma: any) => ({
          id: ma.addOn.id,
          name: ma.addOn.name,
          price: ma.addOn.price,
          description: ma.addOn.description,
        })),
    }
  })

  // If any item has no description (e.g. legacy), generate once and persist so next time it's already there
  const itemsNeedingDescription = enrichedMenuItems.filter(
    (i: any) => !(i.description && String(i.description).trim())
  )
  if (itemsNeedingDescription.length > 0) {
    for (const item of itemsNeedingDescription) {
      const desc = await generateMenuDescription({
        itemName: item.name,
        categoryName: item.category?.name ?? null,
        tags: item.tags ?? null,
        price: item.price ?? null,
      })
      if (!desc) continue
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { description: desc },
      })
      item.description = desc
    }
  }

  const settings = (restaurant.settings as Record<string, unknown>) || {}
  const timezone = (settings.menuTimezone as string) || restaurant.timezone || 'Asia/Baghdad'
  const currentSlot = getCurrentTimeSlot(timezone)

  // Build showcase data — time-based schedule (when enabled), manual items, or AI by time of day
  const scheduleType = (s: typeof showcases[0]) => s.schedule as { useTimeSlots?: boolean; displayForSlot?: 'breakfast' | 'day' | 'evening' | 'night'; breakfast?: { itemIds?: string[] }; day?: { itemIds?: string[] }; evening?: { itemIds?: string[] }; night?: { itemIds?: string[] } } | null
  // Only show time-slot carousels (Breakfast / Day / Evening / Night) during their slot
  const filtered = showcases.filter((s) => {
    const schedule = scheduleType(s)
    const slot = schedule?.displayForSlot
    if (slot === 'breakfast' || slot === 'day' || slot === 'evening' || slot === 'night') return currentSlot === slot
    return true
  })
  // When we're showing a time-slot carousel (e.g. Evening), don't show Chef's Highlights so only one carousel is at the top
  const hasActiveSlotCarousel = filtered.some((s) => scheduleType(s)?.displayForSlot === currentSlot)
  const withoutChefsWhenSlotActive = hasActiveSlotCarousel
    ? filtered.filter((s) => (s as { title?: string; type?: string }).title !== "Chef's Highlights" && (s as { type?: string }).type !== 'CHEFS_HIGHLIGHTS')
    : filtered
  const showcasesToShow = [...withoutChefsWhenSlotActive].sort((a, b) => {
    const aSlot = scheduleType(a)?.displayForSlot
    const bSlot = scheduleType(b)?.displayForSlot
    const aIsCurrentSlot = (aSlot === 'breakfast' || aSlot === 'day' || aSlot === 'evening' || aSlot === 'night') && aSlot === currentSlot
    const bIsCurrentSlot = (bSlot === 'breakfast' || bSlot === 'day' || bSlot === 'evening' || bSlot === 'night') && bSlot === currentSlot
    if (aIsCurrentSlot && !bIsCurrentSlot) return -1
    if (!aIsCurrentSlot && bIsCurrentSlot) return 1
    return 0
  })
  const fullCarouselPool = enrichedMenuItems.map((item: any) => ({
    id: item.id,
    name: item.name,
    category: item.category?.name,
    price: item.price,
    marginPercent: item._featuredScore ?? 0,
  }))
  const timeSlotLabel = getTimeSlotLabel(currentSlot)
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: (settings.menuTimezone as string) || restaurant.timezone || 'Asia/Baghdad' }).format(new Date()),
    10
  )

  const applyAiRotation = (suggestedIds: string[], size: number) => {
    const step = suggestedIds.length > size ? size : 0
    const offset = step > 0 ? (hour % 2) * step : 0
    return suggestedIds.slice(offset, offset + size)
  }

  /** Order carousel/section: first = high margin + high cost, then high margin mid cost, then high margin lower cost. */
  const sortByMarginThenCost = (a: { _featuredScore?: number; price: number }, b: { _featuredScore?: number; price: number }) =>
    (b._featuredScore ?? 0) - (a._featuredScore ?? 0) || b.price - a.price

  /** Time range label for time-slot carousels (shown on the guest menu). */
  const SLOT_TIME_RANGES: Record<'breakfast' | 'day' | 'evening' | 'night', string> = {
    breakfast: '6am–10am',
    day: '10am–2pm',
    evening: '2pm–6pm',
    night: '6pm–6am',
  }

  const showcaseData = await Promise.all(
    showcasesToShow.map(async (showcase) => {
      let showcaseMenuItems: typeof enrichedMenuItems
      const schedule = scheduleType(showcase)
      const useTimeSlots = schedule?.useTimeSlots === true
      const slotItemIds = useTimeSlots ? schedule?.[currentSlot]?.itemIds : undefined

      if (slotItemIds && slotItemIds.length > 0) {
        const idToIndex = new Map(slotItemIds.map((id: string, i: number) => [id, i]))
        showcaseMenuItems = enrichedMenuItems
          .filter((item: any) => idToIndex.has(item.id))
          .sort((a: any, b: any) => (idToIndex.get(a.id) ?? 0) - (idToIndex.get(b.id) ?? 0))
      } else if (useTimeSlots && showcase.items.length > 0) {
        // Time slots on but this slot empty; manual items chosen → AI picks best for this time from chosen items (cached)
        const chosenPool = fullCarouselPool.filter((item) =>
          showcase.items.some((si: any) => si.menuItemId === item.id)
        )
        const suggestedIds = await getCachedCarouselSuggestions(restaurant.id, timeSlotLabel, chosenPool)
        const idsToShow = applyAiRotation(suggestedIds.length > 0 ? suggestedIds : chosenPool.map((i) => i.id), 8)
        const idToOrder = new Map(idsToShow.map((id, i) => [id, i]))
        showcaseMenuItems = enrichedMenuItems
          .filter((item: any) => idToOrder.has(item.id))
          .sort((a: any, b: any) => (idToOrder.get(a.id) ?? 0) - (idToOrder.get(b.id) ?? 0))
        showcaseMenuItems = [...showcaseMenuItems].sort(sortByMarginThenCost)
      } else if (showcase.items.length > 0) {
        const pickedItemIds = new Set(showcase.items.map((si: any) => si.menuItemId))
        showcaseMenuItems = enrichedMenuItems
          .filter((item: any) => pickedItemIds.has(item.id))
          .sort((a: any, b: any) => {
            const orderA =
              showcase.items.find((si: any) => si.menuItemId === a.id)
                ?.displayOrder ?? 0
            const orderB =
              showcase.items.find((si: any) => si.menuItemId === b.id)
                ?.displayOrder ?? 0
            return orderA - orderB
          })
        showcaseMenuItems = [...showcaseMenuItems].sort(sortByMarginThenCost)
      } else {
        // Nothing chosen anywhere: AI suggests by time of day and relevance (variety), cached 5 min
        const suggestedIds = await getCachedCarouselSuggestions(restaurant.id, timeSlotLabel, fullCarouselPool)
        const idsToShow =
          suggestedIds.length > 0
            ? applyAiRotation(suggestedIds, 8)
            : fullCarouselPool
                .slice()
                .sort((a, b) => b.marginPercent - a.marginPercent)
                .map((i) => i.id)
                .slice(0, 8)
        const idToOrder = new Map(idsToShow.map((id, i) => [id, i]))
        showcaseMenuItems = enrichedMenuItems
          .filter((item: any) => idToOrder.has(item.id))
          .sort((a: any, b: any) => (idToOrder.get(a.id) ?? 0) - (idToOrder.get(b.id) ?? 0))
        showcaseMenuItems = [...showcaseMenuItems].sort(sortByMarginThenCost)
      }

      const displaySlot = schedule?.displayForSlot
      const activeTimeRange = displaySlot && (displaySlot === 'breakfast' || displaySlot === 'day' || displaySlot === 'evening' || displaySlot === 'night')
        ? SLOT_TIME_RANGES[displaySlot]
        : undefined

      return {
        id: showcase.id,
        title: showcase.title,
        type: showcase.type ?? 'RECOMMENDATIONS',
        displayVariant: (showcase as any).displayVariant === 'hero' ? 'hero' : 'cards',
        position: showcase.position,
        insertAfterCategoryId: showcase.insertAfterCategoryId,
        activeTimeRange,
        items: showcaseMenuItems.map(
          ({ _featuredScore: _fs, ...item }: any) => item
        ),
      }
    })
  )

  // Fallback: if no showcases configured, build from chefPicks or auto-populate
  if (showcaseData.length === 0) {
    const chefPickItems = enrichedMenuItems
      .filter((item) => item.chefPickOrder != null)
      .sort(
        (a, b) => (a.chefPickOrder ?? 0) - (b.chefPickOrder ?? 0)
      )

    const recommendedItems =
      chefPickItems.length > 0
        ? [...chefPickItems].sort(sortByMarginThenCost)
        : [...enrichedMenuItems]
            .sort(sortByMarginThenCost)
            .slice(0, 8)

    showcaseData.push({
      id: 'default-top',
      title: "Chef's Selection",
      type: 'CHEFS_HIGHLIGHTS',
      displayVariant: 'cards',
      position: 'top',
      insertAfterCategoryId: null,
      items: recommendedItems.map(
        ({ _featuredScore: _fs, ...item }) => item
      ),
    })
  }

  // --- Menu engine: aggregate sales and build co-purchase pairs (server-only)
  const salesByItem = new Map<string, { quantity: number; costSum: number }>()
  for (const sale of salesLast30d) {
    for (const si of sale.items) {
      const cur = salesByItem.get(si.menuItemId) ?? { quantity: 0, costSum: 0 }
      cur.quantity += si.quantity
      cur.costSum += (si.cost ?? 0) * si.quantity
      salesByItem.set(si.menuItemId, cur)
    }
  }
  const todaySalesByItem: Record<string, number> = {}
  for (const sale of salesToday) {
    for (const si of sale.items) {
      todaySalesByItem[si.menuItemId] = (todaySalesByItem[si.menuItemId] ?? 0) + si.quantity
    }
  }

  const unitsSoldInCurrentTimeSlot: Record<string, number> = {}
  for (const sale of salesLast30d) {
    const saleSlot = getTimeSlotForDate(sale.timestamp, timezone)
    if (saleSlot !== currentSlot) continue
    for (const si of sale.items) {
      unitsSoldInCurrentTimeSlot[si.menuItemId] = (unitsSoldInCurrentTimeSlot[si.menuItemId] ?? 0) + si.quantity
    }
  }

  const preppedStocks: Record<string, number> = {}
  for (const row of preppedStocksRows) {
    preppedStocks[row.menuItemId] = row.availableQuantity
  }
  const pairCounts = new Map<string, number>()
  const ordersWithItem = new Map<string, number>()
  for (const sale of salesLast30d) {
    const itemIds = [...new Set(sale.items.map((i: { menuItemId: string }) => i.menuItemId))]
    for (const id of itemIds) {
      ordersWithItem.set(id, (ordersWithItem.get(id) ?? 0) + 1)
    }
    for (let i = 0; i < itemIds.length; i++) {
      for (let j = i + 1; j < itemIds.length; j++) {
        const key = itemIds[i] < itemIds[j] ? `${itemIds[i]}-${itemIds[j]}` : `${itemIds[j]}-${itemIds[i]}`
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
      }
    }
  }
  const coPurchasePairs: CoPurchasePair[] = []
  for (const [key, pairCount] of pairCounts) {
    const [itemIdA, itemIdB] = key.split('-')
    const totalA = ordersWithItem.get(itemIdA) ?? 0
    const totalB = ordersWithItem.get(itemIdB) ?? 0
    const totalOrdersWithEither = totalA + totalB
    coPurchasePairs.push({
      itemIdA,
      itemIdB,
      pairCount,
      totalOrdersWithEither: Math.max(totalOrdersWithEither, pairCount),
      totalOrdersWithA: totalA,
      totalOrdersWithB: totalB,
    })
  }

  const stored = (settings.menuEngine as Record<string, unknown>) || {}
  const storedMode = stored.mode as EngineMode | undefined
  const mode = storedMode && ['classic', 'profit', 'adaptive'].includes(storedMode) ? storedMode : 'classic'
  const base = getSettingsForMode(mode)
  const suggestionKeys = ['moodFlow', 'bundles', 'upsells', 'scarcityBadges', 'priceAnchoring'] as const
  const overrides =
    mode === 'classic'
      ? stored
      : Object.fromEntries(
          suggestionKeys.filter((k) => stored[k] !== undefined).map((k) => [k, stored[k]])
        )
  const menuEngineSettings: MenuEngineSettings = { ...base, ...overrides } as MenuEngineSettings

  const engineItems: EngineMenuItem[] = enrichedMenuItems.map((item: any) => {
    const agg = salesByItem.get(item.id)
    const unitsSold = agg?.quantity ?? 0
    const marginPercent =
      item._featuredScore != null ? item._featuredScore : item.price > 0 && agg ? ((item.price - agg.costSum / Math.max(1, agg.quantity)) / item.price) * 100 : 0
    const foodCost = item.price > 0 ? item.price * (1 - marginPercent / 100) : 0
    return {
      id: item.id,
      name: item.name,
      price: item.price,
      categoryId: item.categoryId,
      categoryName: item.category?.name ?? undefined,
      _cost: foodCost,
      _marginPercent: marginPercent,
      _unitsSold: unitsSold,
    }
  })

  const categoryIdToItems = new Map<string, typeof enrichedMenuItems>()
  for (const item of enrichedMenuItems) {
    const list = categoryIdToItems.get(item.categoryId) ?? []
    list.push(item)
    categoryIdToItems.set(item.categoryId, list)
  }
  const engineCategories: EngineCategory[] = categoriesForMenu.map((c: any) => {
    const catItems = categoryIdToItems.get(c.id) ?? []
    const ids = catItems.map((i: any) => i.id)
    const engineCatItems = engineItems.filter((e) => e.categoryId === c.id)
    const avgUnits = engineCatItems.length ? engineCatItems.reduce((s, i) => s + i._unitsSold, 0) / engineCatItems.length : 0
    const avgMargin = engineCatItems.length ? engineCatItems.reduce((s, i) => s + i._marginPercent, 0) / engineCatItems.length : 0
    return {
      id: c.id,
      name: c.name,
      displayOrder: c.displayOrder,
      itemIds: ids,
      _avgUnitsSold: avgUnits,
      _avgMargin: avgMargin,
    }
  })

  const engineOutput = runMenuEngine({
    settings: menuEngineSettings,
    items: engineItems,
    categories: engineCategories,
    coPurchasePairs,
    preppedStocks,
    todaySalesByItem,
    unitsSoldInCurrentTimeSlot,
  })

  // Attach display-safe hints and popularity so "Sort by: Most Popular" works
  const clientMenuItems = enrichedMenuItems.map((item: any) => {
    const { _featuredScore: _fs, ...rest } = item
    const hints = engineOutput.itemHints[item.id]
    const unitsSold = salesByItem.get(item.id)?.quantity ?? 0
    return {
      ...rest,
      _hints: hints ?? undefined,
      popularityScore: unitsSold,
    }
  })

  // Extract theme from restaurant settings
  const themeFromSettings = (settings.theme as Record<string, unknown>) || {}
  const theme = {
    ...themeFromSettings,
    themePreset: settings.themePreset ?? null,
    backgroundImageUrl: settings.backgroundImageUrl ?? null,
  }

  return {
    restaurant,
    menuItems: clientMenuItems,
    showcases: showcaseData,
    categories: categoriesForMenu.map((c: { id: string; name: string; displayOrder: number }) => ({
      id: c.id,
      name: c.name,
      displayOrder: c.displayOrder,
    })),
    theme,
    engineMode: engineOutput.engineMode,
    bundles: engineOutput.bundles,
    moods: engineOutput.moods,
    upsellMap: engineOutput.upsellMap,
    categoryOrder: engineOutput.categoryOrder,
    categoryAnchorBundle: engineOutput.categoryAnchorBundle,
    maxInitialItemsPerCategory: menuEngineSettings.maxInitialItemsPerCategory ?? 3,
    tables: tables.map((t: { id: string; number: string }) => ({ id: t.id, number: t.number })),
  }
}

export default async function SlugMenuPage({
  params,
}: {
  params: { slug: string }
}) {
  const data = await getMenuData(params.slug)

  if (!data) {
    notFound()
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-white/70">Loading menu…</p></div>}>
    <MenuPersonalizationWrapper
      restaurantId={data.restaurant.id}
      menuItems={data.menuItems}
      showcases={data.showcases}
      categories={data.categories}
      theme={data.theme}
      restaurantName={data.restaurant.name}
      restaurantLogo={data.restaurant.logo}
      engineMode={data.engineMode}
      bundles={data.bundles}
      moods={data.moods}
      upsellMap={data.upsellMap}
      categoryOrder={data.categoryOrder}
      categoryAnchorBundle={data.categoryAnchorBundle}
      maxInitialItemsPerCategory={data.maxInitialItemsPerCategory}
      tables={data.tables}
      forceShowImages
    />
    </Suspense>
  )
}
