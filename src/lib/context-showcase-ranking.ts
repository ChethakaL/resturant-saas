import { classifyItemType } from '@/lib/category-suggest'
import type { EngineMode } from '@/types/menu-engine'

export type ShowcaseSlot = 'breakfast' | 'day' | 'evening' | 'night'
export type ShowcaseContext = 'breakfast' | 'lunch' | 'dinner' | 'hot_day' | 'rainy_day' | 'cold_day'
type RankingMode = Exclude<EngineMode, 'classic'>

export interface ContextShowcaseCandidate {
  id: string
  name: string
  categoryName?: string | null
  description?: string | null
  tags?: string[] | null
  price: number
  marginPercent: number
  totalUnitsSold: number
  slotUnits?: Partial<Record<ShowcaseSlot, number>>
}

export interface ContextShowcaseSuggestions {
  mode: RankingMode
  usedSalesData: boolean
  recommended: string[]
  breakfast: string[]
  lunch: string[]
  dinner: string[]
  hotDay: string[]
  rainyDay: string[]
  coldDay: string[]
  day: string[]
  evening: string[]
  night: string[]
}

type ContextGroup =
  | 'breakfast_core'
  | 'breakfast_drink'
  | 'light_support'
  | 'lunch_main'
  | 'refreshing_support'
  | 'general_main'
  | 'dinner_main'
  | 'sharing'
  | 'evening_support'
  | 'cooling_drink'
  | 'cooling_food'
  | 'light_main'
  | 'warm_drink'
  | 'comfort_food'
  | 'fallback'

// ContextGroup and buildSortedGroups are retained for evaluateContext relevance scoring

interface EvaluatedCandidate extends ContextShowcaseCandidate {
  itemType: ReturnType<typeof classifyItemType>
  haystack: string
  group: ContextGroup
  relevance: number
  modeScore: number
}

/** Always exactly 3 slots: Signature → Chef's Recommendation → Guest Favorite */
const MAX_DEFAULT_ITEMS = 3

function buildHaystack(item: ContextShowcaseCandidate) {
  return `${item.name} ${item.description ?? ''} ${item.categoryName ?? ''} ${(item.tags ?? []).join(' ')}`
    .toLowerCase()
}

function getContextPopularity(item: ContextShowcaseCandidate, context: ShowcaseContext) {
  const slotUnits = item.slotUnits ?? {}
  if (context === 'breakfast') return slotUnits.breakfast ?? 0
  if (context === 'lunch') return (slotUnits.day ?? 0) + (slotUnits.evening ?? 0)
  if (context === 'dinner') return (slotUnits.evening ?? 0) + (slotUnits.night ?? 0)
  return item.totalUnitsSold ?? 0
}

function getModeScore(item: ContextShowcaseCandidate, context: ShowcaseContext, mode: RankingMode, usedSalesData: boolean) {
  const popularity = usedSalesData ? Math.min(getContextPopularity(item, context), 100) : 0
  const priceBonus = Math.min(item.price / 1000, 20)
  if (mode === 'adaptive' && usedSalesData) {
    return item.marginPercent * 1.1 + popularity * 0.9 + priceBonus * 0.1
  }
  return item.marginPercent * 1.25 + priceBonus * 0.15
}

function evaluateContext(item: ContextShowcaseCandidate, context: ShowcaseContext, mode: RankingMode, usedSalesData: boolean): EvaluatedCandidate {
  const haystack = buildHaystack(item)
  const itemType = classifyItemType({
    id: item.id,
    name: item.name,
    categoryName: item.categoryName ?? null,
    marginPercent: item.marginPercent,
    unitsSold: item.totalUnitsSold,
  })
  const isDrink = itemType === 'Drinks'
  const isMain = itemType === 'Main Dishes'
  const isShareable = itemType === 'Shareables'
  const isDessert = itemType === 'Desserts'
  const isBreakfastFood =
    /breakfast|egg|omelette|omelet|toast|croissant|pastry|granola|pancake|waffle|falafel|bagel|manakish|borek|porridge|cereal/.test(
      haystack
    )
  const isBreakfastDrink = /coffee|tea|espresso|latte|cappuccino|americano|juice|smoothie|milkshake/.test(haystack)
  const isRefreshingDrink =
    isDrink &&
    /juice|lemonade|iced|ice tea|ice|ayran|smoothie|water|mojito|mocktail|cold|frappe|slush/.test(haystack)
  const isWarmDrink =
    isDrink &&
    /coffee|tea|espresso|americano|cappuccino|latte|hot chocolate|mocha|turkish coffee|macchiato|sahlab/.test(haystack)
  const isCoolingFood = /salad|yogurt|yoghurt|raita|fruit|fresh|light|cold|feta|greens/.test(haystack)
  const isComfortFood = /soup|stew|grill|kebab|lamb|beef|pasta|rice|shawarma|burger|curry|biryani|hot/.test(haystack)
  const isLunchMain =
    (isMain || isShareable) &&
    /grill|rice|burger|kebab|shawarma|platter|fish|chicken|beef|lamb|meal|pasta|sandwich|wrap/.test(haystack)
  const isDinnerMain =
    (isMain || isShareable) &&
    /grill|steak|kebab|fish|lamb|beef|platter|pasta|rice|burger|shawarma|roast|bbq/.test(haystack)
  const isLightSupport = /salad|soup|starter|appetizer|falafel|croissant|yogurt|fruit|mezze/.test(haystack)
  const isHeavyMain = /steak|lamb|beef|mixed grill|platter|biryani/.test(haystack)

  let group: ContextGroup = 'fallback'
  let relevance = 0

  switch (context) {
    case 'breakfast':
      if (isBreakfastFood) {
        // Specifically breakfast items (eggs, toast, falafel, manakish, etc.)
        group = 'breakfast_core'
        relevance = 100
      } else if (isBreakfastDrink) {
        // Coffee, tea, juice, smoothie — perfect at breakfast
        group = 'breakfast_drink'
        relevance = 88
      } else if (isHeavyMain || (isMain && !isLightSupport)) {
        // Any main dish that isn't specifically light/breakfast-appropriate is wrong here.
        // isHeavyMain catches English keywords; isMain catches any "Main Dishes" classification
        // so non-English item names (e.g. Mashawi, Kabsa) are still excluded.
        relevance = -35
      } else if (isLightSupport) {
        // Salads, soups, yogurt, fruit — light and perfectly fine at breakfast
        group = 'light_support'
        relevance = 72
      } else if (isShareable) {
        // Shareables like hummus, dolma — acceptable but not ideal at breakfast
        relevance = 30
      } else if (isDrink) {
        relevance = 18
      } else {
        relevance = 8
      }
      break
    case 'lunch':
      if (isLunchMain) {
        group = 'lunch_main'
        relevance = 100
      } else if (isShareable) {
        group = 'lunch_main'
        relevance = 86
      } else if (isRefreshingDrink) {
        group = 'refreshing_support'
        relevance = 64
      } else if (isLightSupport) {
        group = 'refreshing_support'
        relevance = 54
      } else if (isMain) {
        group = 'general_main'
        relevance = 58
      } else if (isWarmDrink) {
        relevance = -18
      } else if (isDrink) {
        relevance = -6
      } else {
        relevance = 10
      }
      break
    case 'dinner':
      if (isDinnerMain) {
        group = 'dinner_main'
        relevance = 100
      } else if (isShareable) {
        group = 'sharing'
        relevance = 82
      } else if (isWarmDrink || isDessert) {
        group = 'evening_support'
        relevance = 48
      } else if (isMain) {
        group = 'dinner_main'
        relevance = 62
      } else {
        relevance = 10
      }
      break
    case 'hot_day':
      if (isRefreshingDrink) {
        // Juices, iced drinks, lemonades — perfect on a hot day
        group = 'cooling_drink'
        relevance = 110
      } else if (isCoolingFood) {
        // Salads, yogurt, fresh/cold items — refreshing choices
        group = 'cooling_food'
        relevance = 80
      } else if (/fish|chicken|wrap|sandwich/.test(haystack) && !isHeavyMain && !isComfortFood) {
        // Light mains that aren't heavy/hot
        group = 'light_main'
        relevance = 52
      } else if (isDessert) {
        // Ice cream and cold desserts are great on a hot day
        relevance = 40
      } else if (isDrink && !isWarmDrink) {
        // Other cold/neutral drinks are still fine
        relevance = 30
      } else if (isWarmDrink) {
        relevance = -40
      } else if (isHeavyMain || isComfortFood) {
        // Heavy grills, stews, comfort food — not for a hot day.
        // isComfortFood catches items like "Lamb Stew" that don't match isHeavyMain keywords.
        relevance = -22
      } else {
        relevance = 6
      }
      break
    case 'rainy_day':
    case 'cold_day':
      if (isWarmDrink) {
        // Hot coffee, tea, sahlab — perfect comfort on a rainy/cold day
        group = 'warm_drink'
        relevance = 110
      } else if (isComfortFood || isDinnerMain) {
        // Hearty grills, soups, stews, kebabs — exactly what you want
        group = 'comfort_food'
        relevance = 92
      } else if (isRefreshingDrink || /salad|cold/.test(haystack)) {
        // Cold drinks and salads are not appropriate on a rainy/cold day
        relevance = -24
      } else {
        relevance = 8
      }
      break
  }

  return {
    ...item,
    itemType,
    haystack,
    group,
    relevance,
    modeScore: getModeScore(item, context, mode, usedSalesData),
  }
}

function buildSortedGroups(items: EvaluatedCandidate[]) {
  const groups = new Map<ContextGroup, EvaluatedCandidate[]>()
  for (const item of items) {
    const list = groups.get(item.group) ?? []
    list.push(item)
    groups.set(item.group, list)
  }
  for (const [group, list] of Array.from(groups.entries())) {
    groups.set(
      group,
      list.sort((a, b) => b.relevance - a.relevance || b.modeScore - a.modeScore || b.price - a.price)
    )
  }
  return groups
}

/**
 * Picks exactly 3 items per the behavioral-economics 3-slot framework:
 *
 *   Slot 0 — "Signature"         : highest-priced item relevant to this context (price anchor).
 *   Slot 1 — "Chef's Recommendation" : highest-margin item that costs LESS than the Signature (the target).
 *   Slot 2 — "Guest Favorite"    : second-highest-margin item not yet picked (social proof).
 *
 * Items with negative relevance for the context are excluded from all slots.
 * Falls back gracefully when the menu has fewer than 3 eligible items.
 */
function pickForContext(items: ContextShowcaseCandidate[], context: ShowcaseContext, mode: RankingMode, usedSalesData: boolean, maxItems = MAX_DEFAULT_ITEMS) {
  const evaluated = items
    .map((item) => evaluateContext(item, context, mode, usedSalesData))
    .filter((item) => item.relevance >= 0)
    .filter((item) => {
      if (context !== 'breakfast') return true
      return !/(mixed grill|grill|kebab|biryani|kabsa|tikka|masgouf|shawarma|lamb|beef|platter)/.test(item.haystack)
    })

  if (evaluated.length === 0) return []

  const maxRelevance = Math.max(...evaluated.map((item) => item.relevance))
  const preferredRelevanceFloor = Math.max(0, maxRelevance - 30)
  const preferred = evaluated.filter((item) => item.relevance >= preferredRelevanceFloor)
  const byPrice = [...preferred].sort((a, b) => b.price - a.price || b.modeScore - a.modeScore)

  // Slot 0 — Signature: highest-priced item.
  // For meal-time contexts (breakfast/lunch/dinner/rainy/cold), prefer food items as the
  // price anchor — a warm coffee should never be the "Signature" in a dinner recommendation.
  // Hot-day context is the exception: a premium refreshing drink can lead.
  const isMealContext = context === 'breakfast' || context === 'lunch' || context === 'dinner' || context === 'rainy_day' || context === 'cold_day'
  const foodItems = byPrice.filter((item) => item.itemType !== 'Drinks')
  const signature = isMealContext
    ? (foodItems[0] ?? byPrice[0]) // prefer food, fall back to anything if no food items
    : byPrice[0]                   // hot_day: most expensive item wins (could be a premium drink)

  // Slot 1 — Chef's Recommendation: highest-margin food item cheaper than Signature
  // Also prefer food items here; drinks in this slot confuse the value narrative.
  const byMargin = [...preferred]
    .filter((item) => item.id !== signature.id && item.price < signature.price)
    .sort((a, b) => b.modeScore - a.modeScore || b.marginPercent - a.marginPercent)
  const fallbackByMargin = [...evaluated]
    .filter((item) => item.id !== signature.id && item.price < signature.price)
    .sort((a, b) => b.modeScore - a.modeScore || b.marginPercent - a.marginPercent)
  const foodByMargin = byMargin.filter((item) => item.itemType !== 'Drinks')
  const fallbackFoodByMargin = fallbackByMargin.filter((item) => item.itemType !== 'Drinks')
  const chefsRec = foodByMargin[0] ?? byMargin[0] ?? fallbackFoodByMargin[0] ?? fallbackByMargin[0]

  const shouldReserveWeatherDrink = context === 'hot_day' || context === 'rainy_day' || context === 'cold_day'
  const picked = new Set([signature.id, chefsRec?.id].filter(Boolean) as string[])

  const preferredWeatherDrinks = [...preferred]
    .filter((item) => !picked.has(item.id) && item.itemType === 'Drinks')
    .sort((a, b) => b.relevance - a.relevance || b.modeScore - a.modeScore || b.marginPercent - a.marginPercent || b.price - a.price)
  const fallbackWeatherDrinks = [...evaluated]
    .filter((item) => !picked.has(item.id) && item.itemType === 'Drinks')
    .sort((a, b) => b.relevance - a.relevance || b.modeScore - a.modeScore || b.marginPercent - a.marginPercent || b.price - a.price)
  const weatherDrink = shouldReserveWeatherDrink
    ? preferredWeatherDrinks[0] ?? fallbackWeatherDrinks[0]
    : undefined

  if (weatherDrink) picked.add(weatherDrink.id)

  // Slot 2 — Guest Favorite: second-highest-margin item not yet picked
  const byMarginAll = [...preferred]
    .filter((item) => !picked.has(item.id))
    .sort((a, b) => b.modeScore - a.modeScore || b.marginPercent - a.marginPercent)
  const fallbackByMarginAll = [...evaluated]
    .filter((item) => !picked.has(item.id))
    .sort((a, b) => b.modeScore - a.modeScore || b.marginPercent - a.marginPercent)
  const guestFavorite = weatherDrink ?? byMarginAll[0] ?? fallbackByMarginAll[0]

  const result = [signature, chefsRec, guestFavorite]
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item!.id)

  return result
}

export function buildContextShowcaseSuggestions(
  items: ContextShowcaseCandidate[],
  mode: RankingMode,
  options: { maxItems?: number } = {}
): ContextShowcaseSuggestions {
  const maxItems = options.maxItems ?? MAX_DEFAULT_ITEMS
  const usedSalesData =
    mode === 'adaptive' &&
    items.some((item) => item.totalUnitsSold > 0 || Object.values(item.slotUnits ?? {}).some((value) => (value ?? 0) > 0))

  const breakfast = pickForContext(items, 'breakfast', mode, usedSalesData, maxItems)
  const lunch = pickForContext(items, 'lunch', mode, usedSalesData, maxItems)
  const dinner = pickForContext(items, 'dinner', mode, usedSalesData, maxItems)
  const hotDay = pickForContext(items, 'hot_day', mode, usedSalesData, maxItems)
  const rainyDay = pickForContext(items, 'rainy_day', mode, usedSalesData, maxItems)
  const coldDay = pickForContext(items, 'cold_day', mode, usedSalesData, maxItems)

  return {
    mode,
    usedSalesData,
    recommended: lunch,
    breakfast,
    lunch,
    dinner,
    hotDay,
    rainyDay,
    coldDay,
    day: lunch,
    evening: dinner,
    night: dinner,
  }
}
