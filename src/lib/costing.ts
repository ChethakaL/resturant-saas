/**
 * Ingredient names that may legitimately have zero cost (e.g. tap water).
 * Matched case-insensitively with word boundaries (so "water" matches but not "watermelon").
 */
const ZERO_COST_ALLOWED = ['water']

/**
 * Returns true if this ingredient is allowed to have costPerUnit === 0.
 * Used to avoid "incomplete costing" for free ingredients like water.
 */
export function isZeroCostAllowed(ingredientName: string): boolean {
  const n = (ingredientName || '').trim()
  if (!n) return false
  return ZERO_COST_ALLOWED.some((allowed) => {
    const re = new RegExp(`\\b${allowed}\\b`, 'i')
    return re.test(n)
  })
}
