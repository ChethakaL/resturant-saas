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
}

export interface RunMenuEngineParams {
  settings: MenuEngineSettings
  items: EngineMenuItem[]
  categories: EngineCategory[]
  coPurchasePairs: CoPurchasePair[]
  preppedStocks: Record<string, number>
  todaySalesByItem: Record<string, number>
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

/** Rule 10: 1 hero per category; WORKHORSE = text only (no image). */
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
  priceModifierPercent: number
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
    displayTier = 'featured'
    showImage = true
  } else if (quadrant === 'WORKHORSE') {
    displayTier = 'standard'
    showImage = false
  } else {
    displayTier = 'minimal'
    showImage = false
    hide = scrollDepthHide ?? false
  }
  const finalPrice =
    priceModifierPercent > 0 && priceModifierPercent < 100
      ? item.price * (1 - priceModifierPercent / 100)
      : item.price
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
  mode: EngineMode
): { ordered: EngineMenuItem[]; anchors: Set<string> } {
  if (mode === 'classic' || items.length === 0) {
    return { ordered: [...items], anchors: new Set() }
  }
  // First = high margin + high cost, second = high margin + mid cost, third = high margin + lower cost
  const ordered = [...items].sort(
    (a, b) => (b._marginPercent - a._marginPercent) || (b.price - a.price)
  )
  const anchors = new Set<string>()
  if (ordered[0]) anchors.add(ordered[0].id)
  return { ordered, anchors }
}

function generateBundles(
  pairs: CoPurchasePair[],
  items: EngineMenuItem[],
  threshold: number
): BundleHint[] {
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const bundles: BundleHint[] = []
  const used = new Set<string>()
  for (const p of pairs) {
    if (used.has(p.itemIdA + p.itemIdB) || used.has(p.itemIdB + p.itemIdA)) continue
    const rate = p.totalOrdersWithEither > 0 ? p.pairCount / p.totalOrdersWithEither : 0
    if (rate < threshold) continue
    const a = itemMap.get(p.itemIdA)
    const b = itemMap.get(p.itemIdB)
    if (!a || !b) continue
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
      return ['salad', 'appetizer', 'starter', 'soup', 'light'].some((k) => cat.includes(k))
    })
    .map((i) => i.id)
  const fillingIds = items
    .filter((i) => {
      const cat = byCategory(i.categoryName ?? '')
      return ['main', 'grill', 'burger', 'pasta', 'rice'].some((k) => cat.includes(k))
    })
    .map((i) => i.id)
  const sharingIds = items
    .filter((i) => {
      const cat = byCategory(i.categoryName ?? '')
      return ['platter', 'appetizer', 'starter', 'share'].some((k) => cat.includes(k))
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
  if (avgDailySales > 0 && sold < avgDailySales * 0.5) {
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
    const { ordered: orderedItems, anchors } = computePriceAnchoring(catItems, mode)
    const groups = applyItemCap(orderedItems.map((i) => i.id), maxPerCat)

    let heroAssignedInCategory = false
    let pos = 0
    for (const group of groups) {
      for (const id of group.itemIds) {
        const item = items.find((i) => i.id === id)
        if (!item) continue
        pos++
        const quadrant = quadrants[id]
        const scarcity =
          opts.scarcityBadges
            ? computeScarcityBadges(id, preppedStocks, todaySalesByItem, avgDailySales)
            : { badge: undefined as string | undefined, priceModifierPercent: 0 }
        const isFirstHeroInCategory =
          !heroAssignedInCategory && (quadrant === 'STAR')
        if (isFirstHeroInCategory && quadrant === 'STAR') heroAssignedInCategory = true
        itemHints[id] = computeDisplayHints(
          item,
          quadrant,
          mode,
          pos,
          anchors.has(id),
          group.subGroup !== 'default' ? group.subGroup : undefined,
          scarcity.badge,
          quadrant === 'DOG',
          isFirstHeroInCategory,
          scarcity.priceModifierPercent
        )
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

  const bundles = opts.bundles && mode !== 'classic'
    ? generateBundles(coPurchasePairs, items, opts.bundleCorrelationThreshold)
    : []
  const moods = opts.moodFlow && mode !== 'classic' ? mapMoods(items, quadrants) : []
  const upsellMap: Record<string, UpsellSuggestion[]> = {}
  if (opts.upsells && mode !== 'classic') {
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
