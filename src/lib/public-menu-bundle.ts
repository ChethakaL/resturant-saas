/**
 * Full public menu payload (DB + engine + showcases). Used by the guest menu API route.
 * Do not wrap in unstable_cache — the serialized payload can exceed Next.js data cache limits (~2MB).
 */
import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { runMenuEngine } from '@/lib/menu-engine'
import type { EngineMenuItem, EngineCategory, CoPurchasePair } from '@/lib/menu-engine'
import { getSettingsForMode } from '@/lib/menu-engine-defaults'
import { getCurrentMonthlySalesImport, hasCurrentMonthlySalesImport } from '@/lib/monthly-sales-import'
import type { MenuEngineSettings } from '@/types/menu-engine'
import type { EngineMode } from '@/types/menu-engine'
import { getTimeSlotLabel } from '@/lib/carousel-ai'
import type { CarouselMenuItem } from '@/lib/carousel-ai'
import { generateMenuDescription } from '@/lib/menu-description-ai'
import {
  getCarouselItemIdsForMenuPage,
  getBadgePicksForMenuPage,
  preloadCarouselCacheRows,
} from '@/lib/menu-ai-cache'
import { getCurrentTimeSlot as getSlot, getTimeSlotForDate as getSlotForDate, parseSlotTimes, buildSlotRangeLabels } from '@/lib/time-slots'
import { getPublicMediaAssetUrl } from '@/lib/media-asset-urls'
import { getCachedPublicMenuFeeling } from '@/lib/menu-feeling-public-cache'
import type { MenuTemperatureFeel, MenuWeatherLabel } from '@/lib/menu-feeling-message'
import { buildContextShowcaseSuggestions } from '@/lib/context-showcase-ranking'
import { buildCostedMenuItems, buildImportedSalesByItem } from '@/lib/monthly-sales-derived'
import { upsertContextShowcases } from '@/lib/context-showcase-persistence'
import { designConfigToTheme, menuDesignConfigSchema } from '@/lib/menu-design'

const MAX_CONTEXT_SHOWCASE_ITEMS = 3

/** Lower = faster public menu DB reads. Env PUBLIC_MENU_SALES_CAP (default 150). One query covers last 30d + “today” slice. */
const PUBLIC_MENU_SALES_CAP = Math.min(Math.max(Number(process.env.PUBLIC_MENU_SALES_CAP) || 150, 60), 600)

function virtualContextShowcaseId(restaurantId: string, title: string): string {
  const h = createHash('sha256').update(`${restaurantId}::${title}`).digest('hex').slice(0, 24)
  return `virt-ctx-${h}`
}

function getInitialMenuLanguage(managementLanguage: unknown): 'en' | 'ar_fusha' | 'ku' {
  if (managementLanguage === 'ku') return 'ku'
  if (managementLanguage === 'ar-fusha' || managementLanguage === 'ar_fusha') return 'ar_fusha'
  return 'en'
}

/** Get time slot for a given date in tz (for aggregating sales by slot). */
function getTimeSlotForDate(date: Date, tz: string, slotTimes?: ReturnType<typeof parseSlotTimes> | null): 'breakfast' | 'day' | 'evening' | 'night' {
  return getSlotForDate(date, tz, slotTimes)
}

function queueMissingDescriptionsGeneration({
  items,
  descriptionTone,
}: {
  items: Array<{ id: string; name: string; category?: { name: string | null; id: string } | null; tags?: string[]; price: number; description?: string | null }>
  descriptionTone?: string | null
}) {
  const missingItems = items.filter((item) => !(item.description && String(item.description).trim()))
  if (missingItems.length === 0) return

  void (async () => {
    for (const item of missingItems) {
      const description = await generateMenuDescription({
        itemName: item.name,
        categoryName: item.category?.name ?? null,
        tags: item.tags ?? null,
        price: item.price ?? null,
        descriptionTone,
      })

      if (!description) continue

      await prisma.menuItem.updateMany({
        where: {
          id: item.id,
          OR: [
            { description: null },
            { description: '' },
          ],
        },
        data: { description },
      })
    }
  })().catch((error) => {
    console.error('Background menu description generation failed:', error)
  })
}

export async function getPublicMenuBundleBySlug(slug: string) {
  const perfEnabled = process.env.DEBUG_PUBLIC_MENU_PERF === 'true'
  const perfStart = Date.now()
  const perfMark = (label: string, extra?: string) => {
    if (!perfEnabled) return
    const elapsed = Date.now() - perfStart
    console.log(`[public-menu:${slug}] ${label} +${elapsed}ms${extra ? ` ${extra}` : ''}`)
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: slug.toLowerCase() },
    include: { menuDesign: true },
  })
  perfMark('restaurant lookup')

  if (!restaurant) {
    return null
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const settings = (restaurant.settings as Record<string, unknown>) || {}
  const storedEngine = (settings.menuEngine as Record<string, unknown>) || {}
  const storedMode = storedEngine.mode as EngineMode | undefined
  const requestedMode =
    storedMode && ['classic', 'profit', 'adaptive'].includes(storedMode) ? storedMode : 'classic'
  const mode =
    requestedMode === 'adaptive' && !hasCurrentMonthlySalesImport(settings) ? 'profit' : requestedMode

  const initialLanguage = getInitialMenuLanguage(settings.managementLanguage)
  const timezone = (settings.menuTimezone as string) || restaurant.timezone || 'Asia/Baghdad'
  const slotTimes = parseSlotTimes(settings.slotTimes)
  const currentSlot = getSlot(timezone, slotTimes)
  const feelingPromise = getCachedPublicMenuFeeling({
    restaurantId: restaurant.id,
    lat: restaurant.lat,
    lng: restaurant.lng,
    timezone,
    slot: currentSlot,
    language: initialLanguage,
  })

  const [
    [
      menuItems,
      chefPicks,
      fetchedShowcases,
      categories,
      salesLast30d,
      preppedStocksRows,
      tables,
    ],
    smartSearchFeelingContext,
  ] = await Promise.all([
    prisma.$transaction([
      prisma.menuItem.findMany({
        where: { available: true, status: 'ACTIVE', restaurantId: restaurant.id },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          mediaAssetId: true,
          categoryId: true,
          updatedAt: true,
          tags: true,
          calories: true,
          protein: true,
          carbs: true,
          category: true,
          addOns: {
            select: {
              addOn: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  description: true,
                  available: true,
                },
              },
            },
          },
          translations: initialLanguage === 'en'
            ? false
            : {
                where: { language: initialLanguage },
                select: {
                  translatedName: true,
                  translatedDescription: true,
                  aiDescription: true,
                  protein: true,
                  carbs: true,
                },
              },
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
            select: {
              menuItemId: true,
              displayOrder: true,
            },
          },
        },
      }),

      prisma.category.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { displayOrder: 'asc' },
      }),

      prisma.sale.findMany({
        where: { restaurantId: restaurant.id, timestamp: { gte: thirtyDaysAgo } },
        select: {
          id: true,
          timestamp: true,
          items: { select: { menuItemId: true, quantity: true, cost: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: PUBLIC_MENU_SALES_CAP,
      }),

      prisma.preppedDishStock.findMany({
        where: { restaurantId: restaurant.id },
        select: { menuItemId: true, availableQuantity: true },
      }),

      prisma.table.findMany({
        where: { restaurantId: restaurant.id },
        select: { id: true, number: true },
        orderBy: { number: 'asc' },
      }),
    ]),
    feelingPromise,
  ])
  perfMark(
    'initial queries done',
    `(items=${menuItems.length}, showcases=${fetchedShowcases.length}, categories=${categories.length}, sales=${salesLast30d.length}, tables=${tables.length})`
  )
  const salesToday = salesLast30d.filter((s) => s.timestamp >= todayStart)
  const metricRows =
    menuItems.length === 0
      ? []
      : await prisma.$queryRaw<
          Array<{
            menu_item_id: string
            direct_cost: number
            margin_percent: number
          }>
        >(Prisma.sql`
          SELECT menu_item_id, direct_cost, margin_percent
          FROM public.menu_item_profit_metrics_v
          WHERE restaurant_id = ${restaurant.id}
            AND menu_item_id IN (${Prisma.join(menuItems.map((item) => item.id))})
        `)
  perfMark('metric view query done', `(rows=${metricRows.length})`)
  const directCostByItemId = new Map(metricRows.map((row) => [row.menu_item_id, row.direct_cost ?? 0]))
  const marginByItemId = new Map(metricRows.map((row) => [row.menu_item_id, row.margin_percent ?? 0]))

  let showcases: any[] = fetchedShowcases

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
    const _featuredScore = marginByItemId.get(item.id) ?? 0

    const { ingredients, addOns: menuItemAddOns, ...rest } = item
    return {
      ...rest,
      imageUrl: item.mediaAssetId
        ? getPublicMediaAssetUrl(item.mediaAssetId)
        : `/api/public/menu-item-image?id=${encodeURIComponent(item.id)}`,
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
  const initialTranslationCache =
    initialLanguage === 'en'
      ? {}
      : {
          [initialLanguage]: Object.fromEntries(
            enrichedMenuItems.map((item: any) => {
              const translation = Array.isArray(item.translations) ? item.translations[0] : null
              return [
                item.id,
                {
                  name: translation?.translatedName || '',
                  description: translation?.translatedDescription || '',
                  aiDescription: translation?.aiDescription || translation?.translatedDescription || '',
                  protein: typeof translation?.protein === 'number' ? translation.protein : null,
                  carbs: typeof translation?.carbs === 'number' ? translation.carbs : null,
                },
              ]
            })
          ),
        }

  const themeForTone = (settings.theme as Record<string, unknown>) || {}
  const descriptionTone = typeof themeForTone.descriptionTone === 'string' ? themeForTone.descriptionTone : null
  // Optional: AI backfill for empty descriptions — can flood Gemini + DB; off unless explicitly enabled.
  if (process.env.MENU_DESC_BACKFILL_ON_PUBLIC_VIEW === 'true') {
    queueMissingDescriptionsGeneration({
      items: enrichedMenuItems,
      descriptionTone,
    })
  }

  type ScheduleShape = {
    useTimeSlots?: boolean
    displayForSlot?: 'breakfast' | 'day' | 'evening' | 'night'
    displayForSlots?: ('breakfast' | 'day' | 'evening' | 'night')[]
    breakfast?: { itemIds?: string[] }
    day?: { itemIds?: string[] }
    evening?: { itemIds?: string[] }
    night?: { itemIds?: string[] }
    weatherLabels?: MenuWeatherLabel[]
    temperatureFeels?: MenuTemperatureFeel[]
    label?: string
    seasonalStart?: string
    seasonalEnd?: string
    seasonalBackgroundUrl?: string
    seasonalItemImages?: Record<string, string>
  } | null
  const scheduleType = (s: typeof showcases[0]) => s.schedule as ScheduleShape

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
  const SLOT_TIME_RANGES = buildSlotRangeLabels(slotTimes)
  const LUNCH_RANGE = `${SLOT_TIME_RANGES.day.split('–')[0]}–${SLOT_TIME_RANGES.evening.split('–')[1]}`

  const hasShowcaseMatching = (list: typeof showcases, matcher: (title: string) => boolean) =>
    list.some((showcase) => matcher(`${showcase.title} ${((showcase.schedule as any)?.label as string | undefined) ?? ''}`.toLowerCase()))

  const importedSales = getCurrentMonthlySalesImport(settings)
  const showcaseSalesByItem = new Map<string, { quantity: number; costSum: number }>()
  const showcaseUnitsBySlot = new Map<string, Record<'breakfast' | 'day' | 'evening' | 'night', number>>()
  if (importedSales) {
    const importedByItem = buildImportedSalesByItem(
      importedSales,
      buildCostedMenuItems(
        menuItems.map((item: any) => ({
          ...item,
          cost: directCostByItemId.get(item.id) ?? 0,
        }))
      )
    )
    for (const [menuItemId, value] of Array.from(importedByItem.entries())) {
      showcaseSalesByItem.set(menuItemId, { quantity: value.quantity, costSum: value.costSum })
      showcaseUnitsBySlot.set(menuItemId, {
        breakfast: 0,
        day: value.quantity,
        evening: 0,
        night: 0,
      })
    }
  } else {
    for (const sale of salesLast30d) {
      const saleSlot = getTimeSlotForDate(sale.timestamp, timezone, slotTimes)
      for (const saleItem of sale.items) {
        const current = showcaseSalesByItem.get(saleItem.menuItemId) ?? { quantity: 0, costSum: 0 }
        current.quantity += saleItem.quantity
        current.costSum += (saleItem.cost ?? 0) * saleItem.quantity
        showcaseSalesByItem.set(saleItem.menuItemId, current)
        const slotMap = showcaseUnitsBySlot.get(saleItem.menuItemId) ?? { breakfast: 0, day: 0, evening: 0, night: 0 }
        slotMap[saleSlot] += saleItem.quantity
        showcaseUnitsBySlot.set(saleItem.menuItemId, slotMap)
      }
    }
  }

  const showcaseCandidates = menuItemsInVisibleCategories.map((item: any) => {
    const marginPercent = marginByItemId.get(item.id) ?? 0
    const totals = showcaseSalesByItem.get(item.id)
    return {
      id: item.id,
      name: item.name,
      categoryName: item.category?.name ?? null,
      description: item.description ?? null,
      tags: item.tags ?? [],
      price: item.price ?? 0,
      marginPercent,
      totalUnitsSold: totals?.quantity ?? 0,
      slotUnits: showcaseUnitsBySlot.get(item.id) ?? { breakfast: 0, day: 0, evening: 0, night: 0 },
    }
  })
  const showcaseSuggestions =
    mode === 'classic' ? null : buildContextShowcaseSuggestions(showcaseCandidates, mode, { maxItems: MAX_CONTEXT_SHOWCASE_ITEMS })

  const hasLunchShowcase = showcases.some((showcase) => {
    const title = showcase.title.toLowerCase()
    const schedule = (showcase.schedule as any) || {}
    const displayForSlots = Array.isArray(schedule.displayForSlots) ? schedule.displayForSlots : []
    return /lunch/.test(title) || (displayForSlots.includes('day') && displayForSlots.includes('evening'))
  })

  const missingContextDefinitions =
    mode === 'classic' || !showcaseSuggestions
      ? []
      : ([
          !hasShowcaseMatching(showcases, (title) => /breakfast|morning/.test(title)) && {
            title: "Chef's recommendation for breakfast",
            schedule: { displayForSlot: 'breakfast' },
            itemIds: showcaseSuggestions.breakfast,
          },
          !hasLunchShowcase && {
            title: "Chef's recommendation for lunch",
            schedule: { displayForSlots: ['day', 'evening'] },
            itemIds: showcaseSuggestions.lunch,
          },
          !hasShowcaseMatching(showcases, (title) => /evening|dinner|night/.test(title)) && {
            title: "Chef's recommendation for dinner",
            schedule: { displayForSlot: 'night' },
            itemIds: showcaseSuggestions.dinner,
          },
          !hasShowcaseMatching(showcases, (title) => /hot|summer|cool|cold drink/.test(title)) && {
            title: "Chef's recommendation for a hot day",
            schedule: { label: 'Hot Day', temperatureFeels: ['hot', 'warm'], weatherLabels: ['clear', 'partly-cloudy', 'cloudy'] },
            itemIds: showcaseSuggestions.hotDay,
          },
          !hasShowcaseMatching(showcases, (title) => /rain|rainy|comfort|warm/.test(title)) && {
            title: "Chef's recommendation for a rainy day",
            schedule: { label: 'Rainy Day', weatherLabels: ['rain', 'storm'] },
            itemIds: showcaseSuggestions.rainyDay,
          },
          !hasShowcaseMatching(showcases, (title) => /cold|winter|warm/.test(title)) && {
            title: "Chef's recommendation for a cold day",
            schedule: { label: 'Cold Day', temperatureFeels: ['cold', 'cool'] },
            itemIds: showcaseSuggestions.coldDay,
          },
        ].filter(Boolean) as Array<{
          title: string
          schedule: Record<string, unknown>
          itemIds: string[]
        }>)

  if (missingContextDefinitions.length > 0) {
    const idToEnriched = new Map(enrichedMenuItems.map((item: any) => [item.id, item]))
    for (const definition of missingContextDefinitions) {
      const itemIds = definition.itemIds.slice(0, MAX_CONTEXT_SHOWCASE_ITEMS)
      const rowItems = itemIds
        .map((menuItemId, index) => {
          const menuItem = idToEnriched.get(menuItemId)
          if (!menuItem) return null
          return { menuItemId, displayOrder: index + 1, menuItem }
        })
        .filter(Boolean) as Array<{ menuItemId: string; displayOrder: number; menuItem: (typeof enrichedMenuItems)[0] }>

      showcases.push({
        id: virtualContextShowcaseId(restaurant.id, definition.title),
        title: definition.title,
        type: 'CHEFS_HIGHLIGHTS',
        displayVariant: 'hero',
        position: 'top',
        displayOrder: 999,
        isActive: true,
        schedule: definition.schedule,
        items: rowItems,
      })
    }

    void upsertContextShowcases({
      restaurantId: restaurant.id,
      existingShowcases: fetchedShowcases.map((showcase) => ({
        id: showcase.id,
        title: showcase.title,
        displayOrder: showcase.displayOrder ?? null,
      })),
      definitions: missingContextDefinitions.map((definition) => ({
        ...definition,
        itemIds: definition.itemIds.slice(0, MAX_CONTEXT_SHOWCASE_ITEMS),
      })),
    }).catch((err) => {
      console.error('Background context showcase upsert failed:', err)
    })
  }

  // Filter out seasonal carousels outside their date range.
  const todayStr = new Date().toISOString().slice(0, 10)
  const showcasesDateFiltered = showcases.filter((s) => {
    const sched = scheduleType(s)
    if (!sched?.seasonalStart && !sched?.seasonalEnd) return true
    if (sched.seasonalStart && todayStr < sched.seasonalStart) return false
    if (sched.seasonalEnd && todayStr > sched.seasonalEnd) return false
    return true
  })

  const scheduleMatches = (schedule: ScheduleShape) => {
    if (!schedule) return true
    const slots = schedule?.displayForSlots
    if (Array.isArray(slots) && slots.length > 0 && !slots.includes(currentSlot)) return false
    const slot = schedule?.displayForSlot
    if (slot === 'breakfast' || slot === 'day' || slot === 'evening' || slot === 'night') {
      if (currentSlot !== slot) return false
    }
    const weatherLabels = Array.isArray(schedule.weatherLabels) ? schedule.weatherLabels : []
    if (weatherLabels.length > 0 && !weatherLabels.includes(smartSearchFeelingContext.weatherLabel)) return false
    const temperatureFeels = Array.isArray(schedule.temperatureFeels) ? schedule.temperatureFeels : []
    if (temperatureFeels.length > 0 && !temperatureFeels.includes(smartSearchFeelingContext.temperatureFeel)) return false
    return true
  }
  const showcasesToShow = showcasesDateFiltered.filter((showcase) => scheduleMatches(scheduleType(showcase))).sort((a, b) => {
    const aSlots = scheduleType(a)?.displayForSlots
    const aSingle = scheduleType(a)?.displayForSlot
    const bSlots = scheduleType(b)?.displayForSlots
    const bSingle = scheduleType(b)?.displayForSlot
    const aIsCurrentSlot = (Array.isArray(aSlots) && aSlots.includes(currentSlot)) || (aSingle && aSingle === currentSlot)
    const bIsCurrentSlot = (Array.isArray(bSlots) && bSlots.includes(currentSlot)) || (bSingle && bSingle === currentSlot)
    if (aIsCurrentSlot && !bIsCurrentSlot) return -1
    if (!aIsCurrentSlot && bIsCurrentSlot) return 1
    const aHasWeatherMatch = Boolean(scheduleType(a)?.weatherLabels?.length || scheduleType(a)?.temperatureFeels?.length)
    const bHasWeatherMatch = Boolean(scheduleType(b)?.weatherLabels?.length || scheduleType(b)?.temperatureFeels?.length)
    if (aHasWeatherMatch && !bHasWeatherMatch) return -1
    if (!aHasWeatherMatch && bHasWeatherMatch) return 1
    return 0
  })

  const poolsForCarouselPreload: CarouselMenuItem[][] = []
  for (const showcase of showcasesToShow) {
    const schedule = scheduleType(showcase)
    const useTimeSlots = schedule?.useTimeSlots === true
    const slotItemIds = useTimeSlots ? schedule?.[currentSlot]?.itemIds : undefined
    if (slotItemIds && slotItemIds.length > 0) continue
    if (useTimeSlots && showcase.items.length > 0) {
      const chosen = fullCarouselPool.filter((item) =>
        showcase.items.some((si: any) => si.menuItemId === item.id)
      )
      if (chosen.length > 0) poolsForCarouselPreload.push(chosen)
      continue
    }
    if (showcase.items.length > 0) continue
    if (fullCarouselPool.length > 0) poolsForCarouselPreload.push(fullCarouselPool)
  }

  const carouselPreload = await preloadCarouselCacheRows(restaurant.id, timeSlotLabel, poolsForCarouselPreload)
  const carouselFillDedupe = new Set<string>()
  const carouselOpts = { preloaded: carouselPreload, fillDedupe: carouselFillDedupe } as const

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
        const suggestedIds =
          chosenPool.length === 0
            ? []
            : await getCarouselItemIdsForMenuPage(
                restaurant.id,
                timeSlotLabel,
                chosenPool,
                MAX_CONTEXT_SHOWCASE_ITEMS,
                carouselOpts
              )
        const idsToShow = applyAiRotation(suggestedIds.length > 0 ? suggestedIds : chosenPool.map((i) => i.id), 8)
        const idToOrder = new Map(idsToShow.map((id, i) => [id, i]))
        showcaseMenuItems = enrichedMenuItems
          .filter((item: any) => idToOrder.has(item.id))
          .sort((a: any, b: any) => (idToOrder.get(a.id) ?? 0) - (idToOrder.get(b.id) ?? 0))
      } else if (showcase.items.length > 0) {
        const pickedItemIds = new Set(showcase.items.map((si: any) => si.menuItemId))
        showcaseMenuItems = enrichedMenuItems
          .filter((item: any) => pickedItemIds.has(item.id))
          .sort((a: any, b: any) => {
            const orderA = showcase.items.find((si: any) => si.menuItemId === a.id)?.displayOrder ?? 0
            const orderB = showcase.items.find((si: any) => si.menuItemId === b.id)?.displayOrder ?? 0
            return orderA - orderB
          })
      } else {
        // Nothing chosen anywhere: AI suggests by time of day and relevance (variety), cached 5 min
        const suggestedIds = await getCarouselItemIdsForMenuPage(
          restaurant.id,
          timeSlotLabel,
          fullCarouselPool,
          MAX_CONTEXT_SHOWCASE_ITEMS,
          carouselOpts
        )
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
      }

      const displaySlots = schedule?.displayForSlots
      const displaySlot = schedule?.displayForSlot
      const activeTimeRange = Array.isArray(displaySlots) && displaySlots.length > 0
        ? (displaySlots.includes('day') && displaySlots.includes('evening') ? LUNCH_RANGE : displaySlots.map((sl) => SLOT_TIME_RANGES[sl]).join(', '))
        : displaySlot && (displaySlot === 'breakfast' || displaySlot === 'day' || displaySlot === 'evening' || displaySlot === 'night')
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
        label: schedule?.label ?? undefined,
        seasonalItemImages: schedule?.seasonalItemImages ?? undefined,
        items: showcaseMenuItems.map(
          ({ _featuredScore: _fs, ...item }: any) => item
        ),
      }
    })
  )
  perfMark('showcase data built', `(count=${showcaseData.length})`)

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
      activeTimeRange: undefined,
      label: undefined,
      seasonalItemImages: undefined,
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
    const saleSlot = getTimeSlotForDate(sale.timestamp, timezone, slotTimes)
    if (saleSlot !== currentSlot) continue
    for (const si of sale.items) {
      unitsSoldInCurrentTimeSlot[si.menuItemId] = (unitsSoldInCurrentTimeSlot[si.menuItemId] ?? 0) + si.quantity
    }
  }

  const preppedStocks: Record<string, number> = {}
  for (const row of preppedStocksRows) {
    preppedStocks[row.menuItemId] = row.availableQuantity
  }
  const coPurchasePairs: CoPurchasePair[] = []
  if (mode !== 'classic') {
    const pairCounts = new Map<string, number>()
    const ordersWithItem = new Map<string, number>()
    for (const sale of salesLast30d) {
      const itemIds = Array.from(new Set(sale.items.map((i: { menuItemId: string }) => i.menuItemId)))
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
    for (const [key, pairCount] of Array.from(pairCounts.entries())) {
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
  }

  const base = getSettingsForMode(mode)
  const suggestionKeys = ['moodFlow', 'bundles', 'upsells', 'scarcityBadges', 'priceAnchoring'] as const
  const overrides =
    mode === 'classic'
      ? storedEngine
      : Object.fromEntries(
          suggestionKeys.filter((k) => storedEngine[k] !== undefined).map((k) => [k, storedEngine[k]])
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
      tags: item.tags ?? [],
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

  const totalSales = Array.from(salesByItem.values()).reduce((s, v) => s + v.quantity, 0)
  const hasMeaningfulSales = totalSales >= 10
  // Run badge AI + menu feeling context in parallel — neither depends on the other.
  const badgeItemsPayload = enrichedMenuItems.map((i: any) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    categoryName: i.category?.name,
    price: i.price,
    tags: i.tags,
  }))

  const badgePicks = await getBadgePicksForMenuPage(
    restaurant.id,
    badgeItemsPayload,
    !hasMeaningfulSales && mode !== 'classic'
  )
  perfMark('badge picks loaded')

  const engineOutput = runMenuEngine({
    settings: menuEngineSettings,
    items: engineItems,
    categories: engineCategories,
    coPurchasePairs,
    preppedStocks,
    todaySalesByItem,
    unitsSoldInCurrentTimeSlot,
    aiBadgePicks: badgePicks,
  })
  perfMark('engine run complete')

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
  perfMark('client menu items mapped', `(count=${clientMenuItems.length})`)

  // Extract theme from restaurant settings
  const themeFromSettings = (settings.theme as Record<string, unknown>) || {}
  const publishedDesign = restaurant.menuDesign?.publishedConfig
    ? menuDesignConfigSchema.safeParse(restaurant.menuDesign.publishedConfig)
    : null
  const theme = {
    ...themeFromSettings,
    menuLayout: storedEngine.menuLayout === 'grid' ? 'grid' : 'list',
    themePreset: settings.themePreset ?? null,
    backgroundImageUrl: settings.backgroundImageUrl ?? null,
    ...(publishedDesign?.success ? designConfigToTheme(publishedDesign.data) : {}),
  }

  perfMark('bundle complete')

  return {
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      logo: restaurant.logo,
      currency: restaurant.currency,
      timezone: restaurant.timezone,
    },
    menuItems: clientMenuItems,
    initialLanguage,
    initialTranslationCache,
    showcases: showcaseData,
    categories: categoriesForMenu.map((c: { id: string; name: string; displayOrder: number }) => {
      const nameLower = c.name.toLowerCase()
      // Detect time-bound categories by name and restrict them to the appropriate context.
      // This hides e.g. a "Breakfast" category during lunch/evening shifts.
      let availableContexts: string[] | undefined
      if (/\b(breakfast|morning|سحور|إفطار|بريكفاست|بەیانی)\b/.test(nameLower)) {
        availableContexts = ['morning']
      } else if (/\b(lunch|midday|noon|غداء|نهار|نیوەڕۆ)\b/.test(nameLower)) {
        availableContexts = ['lunch', 'hot']
      } else if (/\b(dinner|evening|night|عشاء|مساء|ئێوارە)\b/.test(nameLower)) {
        availableContexts = ['evening', 'rainy', 'cold']
      }
      return {
        id: c.id,
        name: c.name,
        displayOrder: c.displayOrder,
        ...(availableContexts ? { availableContexts } : {}),
      }
    }),
    theme,
    menuDesign: publishedDesign?.success
      ? {
          config: publishedDesign.data,
          customHtml:
            publishedDesign.data.mode === 'custom'
              ? restaurant.menuDesign?.publishedHtml ?? null
              : null,
        }
      : null,
    engineMode: engineOutput.engineMode,
    bundles: engineOutput.bundles,
    moods: engineOutput.moods,
    upsellMap: engineOutput.upsellMap,
    categoryOrder: engineOutput.categoryOrder,
    menuTimezone: timezone,
    slotTimes,
    categoryAnchorBundle: engineOutput.categoryAnchorBundle,
    maxInitialItemsPerCategory: menuEngineSettings.maxInitialItemsPerCategory ?? 3,
    tables: (settings.tableOrderingEnabled !== false ? tables : []).map((t: { id: string; number: string }) => ({ id: t.id, number: t.number })),
    tableOrderingEnabled: settings.tableOrderingEnabled !== false,
    smartSearchFeelingContext,
    snowfallSettings: {
      enabled: settings.snowfallEnabled === 'true',
      start: (settings.snowfallStart as string) || '12-15',
      end: (settings.snowfallEnd as string) || '01-07',
    },
  }
}
