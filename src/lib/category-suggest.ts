/**
 * AI/rule-based suggestion for grouping menu items into standard categories.
 * Signature Dishes = 2 highest-margin mains + 1 highest-margin shareable (by popularity if POS data, else margin).
 * Other categories: Main Dishes, Shareables, Add-ons, Drinks, Desserts, Kids, Sides.
 */

export const DEFAULT_CATEGORY_NAMES = [
  'Signature Dishes',
  'Main Dishes',
  'Shareables',
  'Add-ons',
  'Drinks',
  'Desserts',
  'Kids',
  'Sides',
] as const

export type DefaultCategoryKey = (typeof DEFAULT_CATEGORY_NAMES)[number]

/** Keywords (lowercase) that map to our category keys. */
const CATEGORY_KEYWORDS: Record<DefaultCategoryKey, string[]> = {
  'Signature Dishes': [], // Filled by logic, not by keyword
  'Main Dishes': ['main', 'mains', 'entree', 'entrees', 'grill', 'grilled', 'burger', 'burgers', 'pizza', 'pastas', 'pasta', 'rice', 'dish', 'platter', 'special', 'specials', 'meal', 'steak', 'noodle'],
  Shareables: ['share', 'sharable', 'shareable', 'appetizer', 'appetizers', 'starter', 'starters', 'snack', 'mezze', 'dip', 'combo'],
  'Add-ons': ['add-on', 'addon', 'extra', 'topping'],
  Drinks: ['drink', 'drinks', 'beverage', 'beverages', 'juice', 'soda', 'water', 'coffee', 'tea', 'mocktail', 'cocktail', 'smoothie'],
  Desserts: ['dessert', 'desserts', 'sweet', 'cake', 'ice cream', 'tart', 'pudding'],
  Kids: ['kids', 'kid', 'children', 'child'],
  Sides: ['side', 'sides', 'salad', 'fries', 'bread', 'dip'],
}

const CATEGORY_NAME_PRIORITY: Record<DefaultCategoryKey, string[]> = {
  'Signature Dishes': [],
  'Main Dishes': ['main dishes', 'mains', 'main', 'pizza', 'entrees', 'entree', 'specials', 'grill', 'grills', 'pasta', 'steak', 'burgers', 'grilled'],
  Shareables: ['shareables', 'shareable', 'appetizers', 'appetizer', 'mezze', 'snacks'],
  'Add-ons': ['add-ons', 'addons', 'extras'],
  Drinks: ['drinks', 'beverages', 'cocktails', 'mocktails', 'coffee', 'tea'],
  Desserts: ['desserts', 'sweets', 'pastries'],
  Kids: ['kids', 'children', 'kids menu'],
  Sides: ['sides', 'salads', 'fries'],
}

export interface ItemForSuggest {
  id: string
  name: string
  categoryName: string | null
  marginPercent: number
  unitsSold: number
}

export interface CategoryForSuggest {
  id: string
  name: string
}

/**
 * Classify item into one of the default category keys (excluding Signature Dishes).
 * Exported for carousel suggested-items (main vs shareable).
 */
export function classifyItemType(item: ItemForSuggest): DefaultCategoryKey {
  const categoryNormalized = (item.categoryName ?? '').toLowerCase()
  for (const [key, matches] of Object.entries(CATEGORY_NAME_PRIORITY)) {
    if (matches.some((match) => categoryNormalized.includes(match))) return key as DefaultCategoryKey
  }
  const combined = `${categoryNormalized} ${item.name}`.toLowerCase()
  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (key === 'Signature Dishes') continue
    if (keywords.some((k) => combined.includes(k))) return key as DefaultCategoryKey
  }
  return 'Main Dishes'
}

/**
 * Suggest category id for each item. Caller must ensure categories exist and pass nameToId map.
 */
export function suggestCategoryAssignments(
  items: ItemForSuggest[],
  nameToId: Record<string, string>
): Map<string, string> {
  const result = new Map<string, string>()
  const byType = new Map<DefaultCategoryKey, ItemForSuggest[]>()
  for (const item of items) {
    const type = classifyItemType(item)
    const list = byType.get(type) ?? []
    list.push(item)
    byType.set(type, list)
  }

  // Signature Dishes: 2 highest margin main + 1 highest margin shareable (by margin; use popularity as tiebreaker if unitsSold > 0)
  const mains = (byType.get('Main Dishes') ?? []).slice()
  const shareables = (byType.get('Shareables') ?? []).slice()
  const score = (i: ItemForSuggest) => i.marginPercent * 1000 + Math.min(i.unitsSold, 1000)
  mains.sort((a, b) => score(b) - score(a))
  shareables.sort((a, b) => score(b) - score(a))
  const signatureIds = new Set<string>()
  for (let i = 0; i < 2 && i < mains.length; i++) signatureIds.add(mains[i].id)
  if (shareables.length > 0) signatureIds.add(shareables[0].id)
  const signatureCatId = nameToId['Signature Dishes']
  if (signatureCatId) {
    for (const id of signatureIds) result.set(id, signatureCatId)
  }

  // All other items: assign to their type category
  for (const [key, list] of byType.entries()) {
    if (key === 'Signature Dishes') continue
    const catId = nameToId[key]
    if (!catId) continue
    for (const item of list) {
      if (!result.has(item.id)) result.set(item.id, catId)
    }
  }

  // Any unassigned (e.g. no matching category) -> Main Dishes
  const mainId = nameToId['Main Dishes']
  if (mainId) {
    for (const item of items) {
      if (!result.has(item.id)) result.set(item.id, mainId)
    }
  }

  return result
}
