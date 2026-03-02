/**
 * Smart Menu Revenue Optimization Engine — server-side only.
 * All margin/cost/quadrant logic runs here; only display-safe output is sent to the client.
 */

import type {
  EngineMode,
  MenuQuadrant,
  ItemDisplayHints,
  BundleHint,
  UpsellSuggestion,
  UpsellStage,
  MoodOption,
  MenuEngineSettings,
  MenuEngineOutput,
} from '@/types/menu-engine'
import { formatMenuPrice } from '@/lib/utils'
import {
  DEFAULT_MENU_ENGINE_SETTINGS,
  MOOD_LABELS,
  MOOD_CATEGORY_MAPPING,
  CATEGORY_PRIORITY_KEYWORDS,
} from '@/lib/menu-engine-defaults'
import { classifyItemType } from '@/lib/category-suggest'

/** Server-side item with cost and sales (never sent to client). */
export interface EngineMenuItem {
  id: string
  name: string
  price: number
  categoryId: string
  categoryName?: string
  _cost: number
  _marginPercent: number
  _unitsSold: number
}

export interface EngineCategory {
  id: string
  name: string
  displayOrder: number
  itemIds: string[]
  _avgUnitsSold: number
  _avgMargin: number
}

/** Co-purchase: pair of menuItemIds and count of orders containing both. */
export interface CoPurchasePair {
  itemIdA: string
  itemIdB: string
  pairCount: number
  totalOrdersWithEither: number
  /** Orders containing item A (for correlation: pairCount / min(A,B) >= threshold). */
  totalOrdersWithA?: number
  totalOrdersWithB?: number
}

export interface BadgePicks {
  signatureIds: string[]
  mostLovedIds: string[]
}

export interface RunMenuEngineParams {
  settings: MenuEngineSettings
  items: EngineMenuItem[]
  categories: EngineCategory[]
  coPurchasePairs: CoPurchasePair[]
  preppedStocks: Record<string, number>
  todaySalesByItem: Record<string, number>
  /** For adaptive mode: units sold in current time slot (e.g. breakfast/lunch/dinner) over recent days so menu changes by time. */
  unitsSoldInCurrentTimeSlot?: Record<string, number>
  /** When no sales data: AI-suggested signature and most loved item IDs. Most items should have no badge. */
  aiBadgePicks?: BadgePicks
}

/** Exported for admin quadrant API only. */
export function classifyQuadrant(
  item: EngineMenuItem,
  categoryAvgSales: number
): MenuQuadrant {
  const cms = item._marginPercent
  const ps = categoryAvgSales > 0 ? item._unitsSold / categoryAvgSales : 0
  const cmsNorm = Math.min(5, Math.max(1, (cms / 20) * 5))
  const psNorm = Math.min(5, Math.max(1, ps * 2))
  if (cmsNorm >= 3.5 && psNorm >= 3.5) return 'STAR'
  if (cmsNorm < 3.5 && psNorm >= 3.5) return 'WORKHORSE'
  if (cmsNorm >= 3.5 && psNorm < 3.5) return 'PUZZLE'
  return 'DOG'
}

/**
 * When no sales data: use AI picks or very selective heuristics.
 * Most items get no badge (suppressBadge). Only 1 signature + 1–2 most loved per category max.
 */
function getColdStartTierAndBadge(
  itemId: string,
  indexInOrder: number,
  categoryItemCount: number,
  aiBadgePicks?: { signatureIds: string[]; mostLovedIds: string[] }
): { tier: 'hero' | 'featured' | 'standard'; suppressBadge: boolean } {
  const sigSet = new Set(aiBadgePicks?.signatureIds ?? [])
  const lovedSet = new Set(aiBadgePicks?.mostLovedIds ?? [])

  if (sigSet.has(itemId)) return { tier: 'hero', suppressBadge: false }
  if (lovedSet.has(itemId)) return { tier: 'featured', suppressBadge: false }

  if (aiBadgePicks && (sigSet.size > 0 || lovedSet.size > 0)) {
    return { tier: 'standard', suppressBadge: true }
  }

  if (categoryItemCount >= 3 && indexInOrder === 0) return { tier: 'hero', suppressBadge: false }
  if (categoryItemCount >= 4 && indexInOrder === 1) return { tier: 'featured', suppressBadge: false }
  return { tier: 'standard', suppressBadge: true }
}

/** Build display hints from an explicit tier (used for cold-start when no sales data). */
function computeDisplayHintsFromTier(
  item: EngineMenuItem,
  tier: ItemDisplayHints['displayTier'],
  mode: EngineMode,
  position: number,
  isAnchor: boolean,
  subGroup: string | undefined,
  badgeText: string | undefined,
  scrollDepthHide: boolean,
  priceModifierPercent: number,
  profitModeVisibleSlot?: boolean
): ItemDisplayHints {
  let showImage = tier !== 'minimal'
  if ((mode === 'profit' || mode === 'adaptive') && profitModeVisibleSlot === false) {
    showImage = false
  }
  const finalPrice =
    priceModifierPercent > 0 && priceModifierPercent < 100
      ? item.price * (1 - priceModifierPercent / 100)
      : item.price
  return {
    displayTier: tier,
    position,
    showImage,
    priceDisplay: formatMenuPrice(finalPrice),
    ...(priceModifierPercent > 0 && { priceModifierPercent }),
    isAnchor,
    subGroup,
    isLimitedToday: !!badgeText && badgeText !== '',
    badgeText,
    scrollDepthHide,
    moodTags: [],
  }
}

/** Rule 10: 1 hero per category; WORKHORSE = text only (no image). Profit: only first N visible slots get images. */
function computeDisplayHints(
  item: EngineMenuItem,
  quadrant: MenuQuadrant,
  mode: EngineMode,
  position: number,
  isAnchor: boolean,
  subGroup: string | undefined,
  badgeText: string | undefined,
  scrollDepthHide: boolean | undefined,
  isFirstHeroInCategory: boolean,
  priceModifierPercent: number,
  profitModeVisibleSlot?: boolean,
  starIndexInCategory?: number
): ItemDisplayHints {
  if (mode === 'classic') {
    return {
      displayTier: 'standard',
      position,
      showImage: true,
      priceDisplay: formatMenuPrice(item.price),
      isAnchor: false,
      isLimitedToday: false,
      scrollDepthHide: false,
      moodTags: [],
    }
  }
  let displayTier: ItemDisplayHints['displayTier'] = 'standard'
  let showImage = true
  let hide = false
  if (quadrant === 'STAR') {
    displayTier = isFirstHeroInCategory ? 'hero' : 'featured'
    showImage = true
  } else if (quadrant === 'PUZZLE') {
    displayTier = 'standard'
    showImage = true
  } else if (quadrant === 'WORKHORSE') {
    displayTier = 'standard'
    showImage = false
  } else {
    displayTier = 'minimal'
    showImage = false
    hide = scrollDepthHide ?? false
  }
  if ((mode === 'profit' || mode === 'adaptive') && profitModeVisibleSlot === false) {
    showImage = false
  }
  const finalPrice =
    priceModifierPercent > 0 && priceModifierPercent < 100
      ? item.price * (1 - priceModifierPercent / 100)
      : item.price
  const starIdx = starIndexInCategory ?? 0
  const suppressBadge = quadrant !== 'STAR' || starIdx > 3
  return {
    displayTier,
    position,
    showImage,
    priceDisplay: formatMenuPrice(finalPrice),
    ...(priceModifierPercent > 0 && { priceModifierPercent }),
    isAnchor,
    subGroup,
    isLimitedToday: !!badgeText && badgeText !== '',
    badgeText,
    scrollDepthHide: hide,
    moodTags: [],
    suppressBadge,
  }
}

function orderCategoriesByProfit(
  categories: EngineCategory[],
  mode: EngineMode
): EngineCategory[] {
  if (mode === 'classic') {
    return [...categories].sort((a, b) => a.displayOrder - b.displayOrder)
  }
  return [...categories].sort((a, b) => (b._avgMargin ?? 0) - (a._avgMargin ?? 0))
}

function applyItemCap(
  itemIds: string[],
  maxPerCat: number
): { itemIds: string[]; subGroup: string }[] {
  if (itemIds.length <= maxPerCat) {
    return [{ itemIds, subGroup: 'default' }]
  }
  const groups = [
    { subGroup: 'Most Ordered', itemIds: itemIds.slice(0, maxPerCat) },
    { subGroup: "Chef's Selection", itemIds: itemIds.slice(maxPerCat, maxPerCat * 2) },
    { subGroup: 'Signature', itemIds: itemIds.slice(maxPerCat * 2, maxPerCat * 3) },
    { subGroup: 'Light Options', itemIds: itemIds.slice(maxPerCat * 3) },
  ].filter((g) => g.itemIds.length > 0)
  return groups
}

/** Order: high margin first, then high cost → mid cost → lower cost (margin DESC, then price DESC). */
function computePriceAnchoring(
  items: EngineMenuItem[],
  mode: EngineMode,
  unitsSoldInCurrentTimeSlot?: Record<string, number>
): { ordered: EngineMenuItem[]; anchors: Set<string> } {
  if (mode === 'classic' || items.length === 0) {
    return { ordered: [...items], anchors: new Set() }
  }
  if (mode === 'profit') {
    const ordered = orderItemsForProfitMode(items)
    const anchors = new Set<string>()
    if (ordered[0]) anchors.add(ordered[0].id)
    return { ordered, anchors }
  }
  if (mode === 'adaptive') {
    const hasPosData =
      unitsSoldInCurrentTimeSlot &&
      Object.keys(unitsSoldInCurrentTimeSlot).length > 0 &&
      Object.values(unitsSoldInCurrentTimeSlot).some((q) => q > 0)
    const ordered = hasPosData
      ? orderItemsForAdaptiveMode(items, unitsSoldInCurrentTimeSlot)
      : orderItemsForProfitMode(items)
    const anchors = new Set<string>()
    if (ordered[0]) anchors.add(ordered[0].id)
    return { ordered, anchors }
  }
  const ordered = [...items].sort(
    (a, b) => (b._marginPercent - a._marginPercent) || (b.price - a.price)
  )
  const anchors = new Set<string>()
  if (ordered[0]) anchors.add(ordered[0].id)
  return { ordered, anchors }
}

/** Profit mode: Slot 1 = high margin + high price; Slot 2 = high margin + price ≈ avg+1std; Slot 3 = high margin + price ≈ avg; rest by margin then price. */
function orderItemsForProfitMode(items: EngineMenuItem[]): EngineMenuItem[] {
  if (items.length === 0) return []
  const sortedByMargin = [...items].sort((a, b) => b._marginPercent - a._marginPercent)
  if (items.length === 1) return [items[0]!]
  if (items.length === 2) return sortedByMargin

  const n = items.length
  const avgPrice = items.reduce((s, i) => s + i.price, 0) / n
  const variance = items.reduce((s, i) => s + (i.price - avgPrice) ** 2, 0) / n
  const stdPrice = Math.sqrt(variance) || 1
  const targetSlot2 = avgPrice + stdPrice
  const marginThreshold = sortedByMargin[Math.min(2, Math.floor(n / 2))]?._marginPercent ?? 0
  const highMargin = items.filter((i) => i._marginPercent >= marginThreshold)

  const pickSlot1 = (): EngineMenuItem => {
    if (highMargin.length === 0) return sortedByMargin[0]!
    const byPrice = [...highMargin].sort((a, b) => b.price - a.price)
    return byPrice[0]!
  }
  const pickClosestTo = (target: number, pool: EngineMenuItem[]): EngineMenuItem | null => {
    if (pool.length === 0) return null
    return pool.reduce((best, cur) =>
      Math.abs(cur.price - target) < Math.abs(best.price - target) ? cur : best
    )
  }

  const slot1 = pickSlot1()
  const remaining1 = items.filter((i) => i.id !== slot1.id)
  const slot2 = pickClosestTo(targetSlot2, remaining1)
  const remaining2 = slot2 ? remaining1.filter((i) => i.id !== slot2.id) : remaining1
  const slot3 = slot2 ? pickClosestTo(avgPrice, remaining2) : null
  const rest = slot3
    ? remaining2.filter((i) => i.id !== slot3.id).sort(
        (a, b) => (b._marginPercent - a._marginPercent) || (b.price - a.price)
      )
    : remaining2.sort((a, b) => (b._marginPercent - a._marginPercent) || (b.price - a.price))
  const firstThree = [slot1, ...(slot2 ? [slot2] : []), ...(slot3 ? [slot3] : [])]
  return [...firstThree, ...rest]
}

/** Adaptive mode: same 3-slot structure as profit but rank by high margin + popularity (units in current time slot). */
function orderItemsForAdaptiveMode(
  items: EngineMenuItem[],
  unitsSoldInCurrentTimeSlot?: Record<string, number>
): EngineMenuItem[] {
  if (items.length === 0) return []
  const units = unitsSoldInCurrentTimeSlot ?? {}
  const score = (i: EngineMenuItem) => {
    const pop = units[i.id] ?? 0
    return i._marginPercent * 0.6 + Math.min(100, pop) * 0.4
  }
  const sortedByScore = [...items].sort((a, b) => score(b) - score(a))
  if (items.length === 1) return [items[0]!]
  if (items.length === 2) return sortedByScore

  const n = items.length
  const avgPrice = items.reduce((s, i) => s + i.price, 0) / n
  const variance = items.reduce((s, i) => s + (i.price - avgPrice) ** 2, 0) / n
  const stdPrice = Math.sqrt(variance) || 1
  const targetSlot2 = avgPrice + stdPrice
  const midIdx = Math.min(2, Math.floor(n / 2))
  const midItem = sortedByScore[midIdx]
  const scoreThreshold = midItem ? score(midItem) : 0
  const highScore = items.filter((i) => score(i) >= scoreThreshold)

  const pickSlot1 = (): EngineMenuItem => {
    if (highScore.length === 0) return sortedByScore[0]!
    const byPrice = [...highScore].sort((a, b) => b.price - a.price)
    return byPrice[0]!
  }
  const pickClosestTo = (target: number, pool: EngineMenuItem[]): EngineMenuItem | null => {
    if (pool.length === 0) return null
    return pool.reduce((best, cur) =>
      Math.abs(cur.price - target) < Math.abs(best.price - target) ? cur : best
    )
  }

  const slot1 = pickSlot1()
  const remaining1 = items.filter((i) => i.id !== slot1.id)
  const slot2 = pickClosestTo(targetSlot2, remaining1)
  const remaining2 = slot2 ? remaining1.filter((i) => i.id !== slot2.id) : remaining1
  const slot3 = slot2 ? pickClosestTo(avgPrice, remaining2) : null
  const rest = slot3
    ? remaining2.filter((i) => i.id !== slot3.id).sort((a, b) => score(b) - score(a))
    : remaining2.sort((a, b) => score(b) - score(a))
  const firstThree = [slot1, ...(slot2 ? [slot2] : []), ...(slot3 ? [slot3] : [])]
  return [...firstThree, ...rest]
}

/** Top N "often bought together" pairs by purchase count. Filter by co-purchase correlation (e.g. 35%). */
const TOP_BUNDLES_BY_COUNT = 5

/** True if item is classified as Main Dishes (so we never bundle two mains). */
function isMainDish(item: EngineMenuItem): boolean {
  const type = classifyItemType({
    id: item.id,
    name: item.name,
    categoryName: item.categoryName ?? null,
    marginPercent: item._marginPercent,
    unitsSold: item._unitsSold,
  })
  return type === 'Main Dishes'
}

function generateBundles(
  pairs: CoPurchasePair[],
  items: EngineMenuItem[],
  correlationThreshold: number
): BundleHint[] {
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const withCorrelation = pairs
    .map((p) => {
      const totalA = p.totalOrdersWithA ?? 0
      const totalB = p.totalOrdersWithB ?? 0
      const minOrders = Math.min(totalA, totalB)
      const correlation = minOrders > 0 ? p.pairCount / minOrders : 0
      return { p, correlation }
    })
    .filter(({ correlation }) => correlation >= correlationThreshold)
  const sorted = [...withCorrelation].sort((a, b) => b.pairCount - a.pairCount)
  const bundles: BundleHint[] = []
  const used = new Set<string>()
  for (let i = 0; i < sorted.length && bundles.length < TOP_BUNDLES_BY_COUNT; i++) {
    const { p } = sorted[i]
    if (used.has(p.itemIdA + p.itemIdB) || used.has(p.itemIdB + p.itemIdA)) continue
    const a = itemMap.get(p.itemIdA)
    const b = itemMap.get(p.itemIdB)
    if (!a || !b) continue
    if (isMainDish(a) && isMainDish(b)) continue
    const originalPrice = a.price + b.price
    const discount = Math.round(originalPrice * 0.07)
    const bundlePrice = originalPrice - discount
    const savingsText = `Save ${formatMenuPrice(discount)}`
    bundles.push({
      id: `bundle-${p.itemIdA}-${p.itemIdB}`,
      name: `${a.name} + ${b.name}`,
      itemIds: [a.id, b.id],
      bundlePrice,
      originalPrice,
      savingsText,
    })
    used.add(p.itemIdA + p.itemIdB)
  }
  return bundles
}

function mapMoods(
  items: EngineMenuItem[],
  quadrants: Record<string, MenuQuadrant>
): MoodOption[] {
  const byCategory = (name: string) =>
    name
      .toLowerCase()
      .replace(/s$/, '')
  const lightIds = items
    .filter((i) => {
      const cat = byCategory(i.categoryName ?? '')
      const tags = (i.tags ?? []).join(' ').toLowerCase()
      return ['salad', 'appetizer', 'starter', 'soup', 'light', 'drink', 'beverage', 'juice'].some((k) => cat.includes(k) || tags.includes(k))
    })
    .map((i) => i.id)
  const fillingIds = items
    .filter((i) => {
      const cat = byCategory(i.categoryName ?? '')
      const tags = (i.tags ?? []).join(' ').toLowerCase()
      return ['main', 'grill', 'burger', 'pasta', 'rice', 'dish', 'sandwich', 'wrap', 'kebab', 'steak', 'meal'].some((k) => cat.includes(k) || tags.includes(k))
    })
    .map((i) => i.id)
  const sharingIds = items
    .filter((i) => {
      const cat = byCategory(i.categoryName ?? '')
      const tags = (i.tags ?? []).join(' ').toLowerCase()
      return ['platter', 'appetizer', 'starter', 'share', 'party', 'family'].some((k) => cat.includes(k) || tags.includes(k))
    })
    .map((i) => i.id)
  const premiumIds = items
    .filter((i) => quadrants[i.id] === 'STAR' || i.price > 15000)
    .map((i) => i.id)
  return [
    { id: 'light', label: MOOD_LABELS.light, itemIds: lightIds },
    { id: 'filling', label: MOOD_LABELS.filling, itemIds: fillingIds },
    { id: 'sharing', label: MOOD_LABELS.sharing, itemIds: sharingIds },
    { id: 'premium', label: MOOD_LABELS.premium, itemIds: premiumIds },
  ]
}

function buildUpsellSequence(
  itemId: string,
  allItems: EngineMenuItem[],
  quadrants: Record<string, MenuQuadrant>
): UpsellSuggestion[] {
  const item = allItems.find((i) => i.id === itemId)
  if (!item) return []
  const seq: UpsellSuggestion[] = []
  const stars = allItems.filter((i) => quadrants[i.id] === 'STAR')
  const protein = stars.find((i) => (i.categoryName ?? '').toLowerCase().includes('grill') || (i.categoryName ?? '').toLowerCase().includes('main'))
  const side = stars.find((i) => (i.categoryName ?? '').toLowerCase().includes('side'))
  const beverage = stars.find((i) => (i.categoryName ?? '').toLowerCase().includes('drink') || (i.categoryName ?? '').toLowerCase().includes('beverage') || (i.categoryName ?? '').toLowerCase().includes('coffee'))
  const dessert = stars.find((i) => (i.categoryName ?? '').toLowerCase().includes('dessert'))
  if (protein && protein.id !== itemId)
    seq.push({ stage: 'protein_upgrade', itemId: protein.id, nudgeText: 'Upgrade with a premium protein?' })
  if (side && side.id !== itemId)
    seq.push({ stage: 'premium_side', itemId: side.id, nudgeText: 'Most guests add a side.' })
  if (beverage && beverage.id !== itemId)
    seq.push({ stage: 'beverage', itemId: beverage.id, nudgeText: 'Most guests complete with a refreshing drink.' })
  if (dessert && dessert.id !== itemId)
    seq.push({ stage: 'dessert', itemId: dessert.id, nudgeText: 'End your meal on a sweet note?' })
  return seq
}

function computeScarcityBadges(
  itemId: string,
  preppedStocks: Record<string, number>,
  todaySales: Record<string, number>,
  avgDailySales: number
): { badge?: string; priceModifierPercent: number } {
  const stock = preppedStocks[itemId]
  const sold = todaySales[itemId] ?? 0
  if (typeof stock === 'number' && stock > 0 && stock <= 5) {
    return { badge: 'Limited Today', priceModifierPercent: 5 }
  }
  // Only show "Today's Selection" when there's meaningful sales activity — otherwise almost every item would get it
  if (avgDailySales >= 1 && sold < avgDailySales * 0.5) {
    return { badge: "Today's Selection", priceModifierPercent: 5 }
  }
  return { priceModifierPercent: 0 }
}

export function runMenuEngine(params: RunMenuEngineParams): MenuEngineOutput {
  const {
    settings,
    items,
    categories,
    coPurchasePairs,
    preppedStocks,
    todaySalesByItem,
  } = params
  const mode = settings.mode
  const opts = { ...DEFAULT_MENU_ENGINE_SETTINGS, ...settings }
  const categoryList = orderCategoriesByProfit(categories, mode)
  const categoryOrder = categoryList.map((c) => c.id)

  const itemHints: Record<string, ItemDisplayHints> = {}
  const quadrants: Record<string, MenuQuadrant> = {}

  const totalDailySales = Object.values(todaySalesByItem).reduce((a, b) => a + b, 0)
  const itemCount = items.length
  const avgDailySales = itemCount > 0 ? totalDailySales / itemCount : 0

  const categoryAnchorBundle: Record<string, BundleHint> = {}

  for (const cat of categoryList) {
    const catItems = items.filter((i) => i.categoryId === cat.id)
    const withQuadrant = catItems.map((item) => ({
      item,
      quadrant: classifyQuadrant(item, cat._avgUnitsSold || 1),
    }))
    withQuadrant.forEach(({ item, quadrant }) => {
      quadrants[item.id] = quadrant
    })

    const maxPerCat = opts.maxItemsPerCategory
    const maxInitial = opts.maxInitialItemsPerCategory ?? 3
    const { ordered: orderedItems, anchors } = computePriceAnchoring(
      catItems,
      mode,
      params.unitsSoldInCurrentTimeSlot
    )
    const groups = applyItemCap(orderedItems.map((i) => i.id), maxPerCat)

    const hasSalesData = (cat._avgUnitsSold ?? 0) > 0.5
    const catItemCount = catItems.length

    let heroAssignedInCategory = false
    let starIndexInCategory = 0
    let pos = 0
    let indexInCategory = 0
    for (const group of groups) {
      for (const id of group.itemIds) {
        const item = items.find((i) => i.id === id)
        if (!item) continue
        pos++
        const quadrant = quadrants[id]
        if (quadrant === 'STAR') starIndexInCategory++
        const scarcity =
          opts.scarcityBadges
            ? computeScarcityBadges(id, preppedStocks, todaySalesByItem, avgDailySales)
            : { badge: undefined as string | undefined, priceModifierPercent: 0 }
        const isFirstHeroInCategory =
          !heroAssignedInCategory && (quadrant === 'STAR' || !hasSalesData)
        if (isFirstHeroInCategory && (quadrant === 'STAR' || !hasSalesData)) heroAssignedInCategory = true
        const profitModeVisibleSlot =
          mode === 'profit' || mode === 'adaptive' ? indexInCategory < maxInitial : undefined

        let hints: ItemDisplayHints
        if (!hasSalesData && mode !== 'classic') {
          const { tier, suppressBadge } = getColdStartTierAndBadge(
            id,
            indexInCategory,
            catItemCount,
            params.aiBadgePicks
          )
          hints = computeDisplayHintsFromTier(
            item,
            tier,
            mode,
            pos,
            anchors.has(id),
            group.subGroup !== 'default' ? group.subGroup : undefined,
            scarcity.badge,
            false,
            scarcity.priceModifierPercent,
            profitModeVisibleSlot
          )
          if (suppressBadge) hints.suppressBadge = true
        } else {
          hints = computeDisplayHints(
            item,
            quadrant,
            mode,
            pos,
            anchors.has(id),
            group.subGroup !== 'default' ? group.subGroup : undefined,
            scarcity.badge,
            quadrant === 'DOG',
            isFirstHeroInCategory,
            scarcity.priceModifierPercent,
            profitModeVisibleSlot,
            starIndexInCategory
          )
        }
        itemHints[id] = hints
        indexInCategory++
        if (itemHints[id].moodTags) {
          const moodIds = Object.keys(MOOD_LABELS).filter((moodId) => {
            const keywords = MOOD_CATEGORY_MAPPING[moodId]
            if (!keywords.length && moodId === 'premium') return quadrants[id] === 'STAR' || item.price > 15000
            const catName = (item.categoryName ?? '').toLowerCase()
            return keywords.some((k) => catName.includes(k))
          })
          itemHints[id].moodTags = moodIds
        }
      }
    }
  }

  const bundles = opts.bundles
    ? generateBundles(coPurchasePairs, items, opts.bundleCorrelationThreshold ?? 0.35)
    : []
  const moods = opts.moodFlow ? mapMoods(items, quadrants) : []
  const upsellMap: Record<string, UpsellSuggestion[]> = {}
  if (opts.upsells) {
    for (const item of items) {
      upsellMap[item.id] = buildUpsellSequence(item.id, items, quadrants)
    }
  }

  // Bundle as anchor when no high-priced item in category (Rule 7)
  const avgPrice =
    items.length > 0 ? items.reduce((s, i) => s + i.price, 0) / items.length : 0
  const highAnchorThreshold = Math.max(avgPrice * 0.8, 8000)
  for (const cat of categoryList) {
    const catItems = items.filter((i) => i.categoryId === cat.id)
    const maxPriceInCat = catItems.length ? Math.max(...catItems.map((i) => i.price)) : 0
    if (maxPriceInCat >= highAnchorThreshold || bundles.length === 0) continue
    const catItemIds = new Set(catItems.map((i) => i.id))
    const bundlesForCat = bundles.filter((b) => b.itemIds.some((id) => catItemIds.has(id)))
    const best = bundlesForCat.sort((a, b) => b.bundlePrice - a.bundlePrice)[0]
    if (best) categoryAnchorBundle[cat.id] = best
  }

  return {
    engineMode: mode,
    categoryOrder,
    itemHints,
    bundles,
    moods,
    upsellMap,
    categoryAnchorBundle: Object.keys(categoryAnchorBundle).length > 0 ? categoryAnchorBundle : undefined,
  }
}
