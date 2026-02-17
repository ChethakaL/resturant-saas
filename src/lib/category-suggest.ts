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

/** Order to check keyword match: most specific first so e.g. "kids burger" → Kids, not Main Dishes. */
const CLASSIFICATION_ORDER: DefaultCategoryKey[] = [
  'Drinks',
  'Desserts',
  'Kids',
  'Add-ons',
  'Sides',
  'Shareables',
  'Main Dishes',
]

/** Keywords (lowercase) in item name + category that map to our category keys. Checked in CLASSIFICATION_ORDER. */
const CATEGORY_KEYWORDS: Record<DefaultCategoryKey, string[]> = {
  'Signature Dishes': [], // Filled by logic, not by keyword
  'Main Dishes': [
    'main', 'mains', 'entree', 'entrees', 'grill', 'grilled', 'burger', 'burgers', 'pizza', 'pastas', 'pasta',
    'rice', 'dish', 'dishes', 'platter', 'special', 'specials', 'meal', 'steak', 'noodle', 'noodles',
    'biryani', 'kebab', 'kebabs', 'kebap', 'shawarma', 'shwarma', 'grills', 'mains', 'main course',
    'soup', 'soups', 'shorba', 'ramen', 'curry', 'curries', 'fish', 'seafood', 'chicken', 'lamb', 'beef',
    'wrap', 'wraps', 'sandwich', 'sandwiches', 'tikka', 'masala', 'kofta',
  ],
  Shareables: [
    'share', 'sharable', 'shareable', 'shareables', 'appetizer', 'appetizers', 'starter', 'starters',
    'snack', 'snacks', 'mezze', 'meze', 'dip', 'dips', 'combo', 'hummus', 'falafel', 'sambousek',
    'sambusa', 'spring roll', 'wings', 'fries', 'nachos', 'platter', 'sharing', 'ghanoush', 'baba ghanoush',
    'dolma', 'stuffed grape', 'grape leaves', 'muttabal', 'moutabal',
  ],
  'Add-ons': [
    'add-on', 'addons', 'add ons', 'extra', 'extras', 'topping', 'toppings', 'side sauce',
    'sauce', 'dip', 'upgrade',
  ],
  Drinks: [
    'drink', 'drinks', 'beverage', 'beverages', 'juice', 'juices', 'soda', 'sodas', 'water', 'coffee',
    'tea', 'mocktail', 'mocktails', 'cocktail', 'cocktails', 'smoothie', 'smoothies', 'latte', 'cappuccino',
    'espresso', 'americano', 'mocha', 'cola', 'lemonade', 'milkshake', 'shake', 'cold drink', 'hot drink',
  ],
  Desserts: [
    'dessert', 'desserts', 'sweet', 'sweets', 'cake', 'cakes', 'ice cream', 'tart', 'tarts', 'pudding',
    'baklava', 'kunafa', 'knafa', 'cookie', 'cookies', 'pastry', 'pastries', 'pie', 'brownie',
  ],
  Kids: ['kids', 'kid', 'children', 'child', 'kids menu', 'children\'s', 'childrens'],
  Sides: [
    'side', 'sides', 'salad', 'salads', 'fries', 'bread', 'rice', 'vermicelli', 'yogurt', 'raita',
    'coleslaw', 'mashed', 'vegetable', 'veggie',
  ],
}

/** Existing category name (e.g. from DB) → our category key. Used when item already has a category. */
const CATEGORY_NAME_PRIORITY: Record<DefaultCategoryKey, string[]> = {
  'Signature Dishes': ['signature dishes', 'signature dish', 'signature', 'signature sandwich', 'signature sandwiches'],
  'Main Dishes': [
    'main dishes', 'main dish', 'mains', 'main', 'main course', 'main courses', 'entrees', 'entree',
    'pizza', 'specials', 'grill', 'grills', 'grilled', 'pasta', 'steak', 'burgers', 'rice & mains',
  ],
  Shareables: ['shareables', 'shareable', 'appetizers', 'appetizer', 'starters', 'starter', 'mezze', 'snacks', 'meze'],
  'Add-ons': ['add-ons', 'addons', 'add ons', 'extras', 'toppings', 'topping'],
  Drinks: ['drinks', 'beverages', 'beverage', 'cocktails', 'mocktails', 'coffee', 'tea', 'juices', 'cold drinks', 'hot drinks'],
  Desserts: ['desserts', 'dessert', 'sweets', 'sweet', 'pastries', 'pastry'],
  Kids: ['kids', 'children', 'kids menu', 'children\'s', 'childrens'],
  Sides: ['sides', 'side', 'salads', 'salad', 'fries', 'rice & sides', 'rice and sides', 'sides & rice'],
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
 * Classify item into one of the default category keys (excluding Signature Dishes for keyword path).
 * Exported for carousel suggested-items (main vs shareable).
 * 1) If item has a non-standard category name (e.g. "Beverages", "Rice & Sides"), map it via CATEGORY_NAME_PRIORITY.
 * 2) Otherwise classify by item name so we can fix mis-categorized items (e.g. "Saffron Rice" in Main Dishes → Sides).
 */
export function classifyItemType(item: ItemForSuggest): DefaultCategoryKey {
  const categoryNormalized = (item.categoryName ?? '').toLowerCase().trim()
  const isAlreadyStandardCategory = DEFAULT_CATEGORY_NAMES.some(
    (n) => n.toLowerCase() === categoryNormalized
  )
  // Only map by category name when it's an alternate (e.g. "Beverages" → Drinks). If already "Main Dishes", re-check by item name.
  if (!isAlreadyStandardCategory) {
    for (const key of DEFAULT_CATEGORY_NAMES) {
      const matches = CATEGORY_NAME_PRIORITY[key]
      if (matches.length && matches.some((m) => categoryNormalized.includes(m))) return key
    }
  }
  const combined = `${categoryNormalized} ${item.name}`.toLowerCase()
  for (const key of CLASSIFICATION_ORDER) {
    const keywords = CATEGORY_KEYWORDS[key]
    if (keywords.length && keywords.some((k) => combined.includes(k))) return key
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

  // Signature Dishes: top mains + top shareables by margin & popularity (so high-margin items get highlighted)
  const mains = (byType.get('Main Dishes') ?? []).slice()
  const shareables = (byType.get('Shareables') ?? []).slice()
  const score = (i: ItemForSuggest) => i.marginPercent * 1000 + Math.min(i.unitsSold, 1000)
  mains.sort((a, b) => score(b) - score(a))
  shareables.sort((a, b) => score(b) - score(a))
  const signatureIds = new Set<string>()
  const signatureMainsCount = 4  // top 4 highest-margin mains
  const signatureShareablesCount = 2 // top 2 highest-margin shareables
  for (let i = 0; i < signatureMainsCount && i < mains.length; i++) signatureIds.add(mains[i].id)
  for (let i = 0; i < signatureShareablesCount && i < shareables.length; i++) signatureIds.add(shareables[i].id)
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
