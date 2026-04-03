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

interface EvaluatedCandidate extends ContextShowcaseCandidate {
  itemType: ReturnType<typeof classifyItemType>
  haystack: string
  group: ContextGroup
  relevance: number
  modeScore: number
}

const MAX_DEFAULT_ITEMS = 6

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
        group = 'breakfast_core'
        relevance = 100
      } else if (isBreakfastDrink) {
        group = 'breakfast_drink'
        relevance = 88
      } else if (isLightSupport) {
        group = 'light_support'
        relevance = 72
      } else if (isDrink) {
        relevance = 18
      } else if (isHeavyMain) {
        relevance = -35
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
        group = 'cooling_drink'
        relevance = 110
      } else if (isCoolingFood) {
        group = 'cooling_food'
        relevance = 80
      } else if (/fish|chicken|wrap|sandwich/.test(haystack)) {
        group = 'light_main'
        relevance = 52
      } else if (isWarmDrink) {
        relevance = -40
      } else if (isHeavyMain) {
        relevance = -22
      } else {
        relevance = 6
      }
      break
    case 'rainy_day':
    case 'cold_day':
      if (isWarmDrink) {
        group = 'warm_drink'
        relevance = 110
      } else if (isComfortFood || isDinnerMain) {
        group = 'comfort_food'
        relevance = 92
      } else if (isRefreshingDrink || /salad|cold/.test(haystack)) {
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

function pickForContext(items: ContextShowcaseCandidate[], context: ShowcaseContext, mode: RankingMode, usedSalesData: boolean, maxItems = MAX_DEFAULT_ITEMS) {
  const evaluated = items.map((item) => evaluateContext(item, context, mode, usedSalesData))
  const groups = buildSortedGroups(evaluated)

  const quotas: Record<ShowcaseContext, Array<{ group: ContextGroup; limit: number }>> = {
    breakfast: [
      { group: 'breakfast_core', limit: 3 },
      { group: 'breakfast_drink', limit: 2 },
      { group: 'light_support', limit: 1 },
    ],
    lunch: [
      { group: 'lunch_main', limit: 4 },
      { group: 'refreshing_support', limit: 1 },
      { group: 'general_main', limit: 1 },
    ],
    dinner: [
      { group: 'dinner_main', limit: 4 },
      { group: 'sharing', limit: 1 },
      { group: 'evening_support', limit: 1 },
    ],
    hot_day: [
      { group: 'cooling_drink', limit: 3 },
      { group: 'cooling_food', limit: 2 },
      { group: 'light_main', limit: 1 },
    ],
    rainy_day: [
      { group: 'warm_drink', limit: 2 },
      { group: 'comfort_food', limit: 4 },
    ],
    cold_day: [
      { group: 'warm_drink', limit: 2 },
      { group: 'comfort_food', limit: 4 },
    ],
  }

  const selected: string[] = []
  const seen = new Set<string>()
  const addItem = (item?: EvaluatedCandidate) => {
    if (!item || seen.has(item.id) || selected.length >= maxItems) return
    selected.push(item.id)
    seen.add(item.id)
  }

  for (const { group, limit } of quotas[context]) {
    const list = groups.get(group) ?? []
    let taken = 0
    for (const item of list) {
      if (taken >= limit || selected.length >= maxItems) break
      if (seen.has(item.id)) continue
      addItem(item)
      taken += 1
    }
  }

  const fallback = evaluated
    .slice()
    .sort((a, b) => b.relevance - a.relevance || b.modeScore - a.modeScore || b.price - a.price)

  for (const item of fallback) {
    if (selected.length >= maxItems) break
    addItem(item)
  }

  return selected
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
