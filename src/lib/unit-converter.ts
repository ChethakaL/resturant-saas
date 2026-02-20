/**
 * Unit conversion utilities for inventory normalization.
 *
 * Only four units are allowed in inventory: g, kg, ml, L.
 * This module converts any legacy/recipe units into one of those four.
 */

export const ALLOWED_UNITS = ['g', 'kg', 'ml', 'L'] as const
export type AllowedUnit = typeof ALLOWED_UNITS[number]

export function isAllowedUnit(unit: string): unit is AllowedUnit {
  return ALLOWED_UNITS.includes(unit.trim() as AllowedUnit)
}

/** Normalise a unit string to canonical form (e.g. 'KG' → 'kg', 'litre' → 'L'). */
export function canonicalise(unit: string): string {
  const u = unit.trim().toLowerCase()
  if (u === 'g' || u === 'gram' || u === 'grams') return 'g'
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms' || u === 'kilo') return 'kg'
  if (u === 'ml' || u === 'millilitre' || u === 'millilitres' || u === 'milliliter' || u === 'milliliters' || u === 'cc') return 'ml'
  if (u === 'l' || u === 'litre' || u === 'litres' || u === 'liter' || u === 'liters') return 'L'
  return unit.trim() // not recognised → keep as-is
}

// ─── conversion factors to base unit (g for dry, ml for liquid) ────────────

const DRY_TO_GRAMS: Record<string, number> = {
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  cup: 120,    // conservative (flour density)
  cups: 120,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
  // already metric
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
}

const LIQUID_TO_ML: Record<string, number> = {
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  cup: 240,
  cups: 240,
  'fl oz': 29.57,
  floz: 29.57,
  oz: 29.57, // treat oz as fl oz for liquid context
  ounce: 29.57,
  ounces: 29.57,
  pt: 473.2,
  pint: 473.2,
  pints: 473.2,
  qt: 946.4,
  quart: 946.4,
  quarts: 946.4,
  // already metric
  ml: 1,
  millilitre: 1,
  millilitres: 1,
  milliliter: 1,
  milliliters: 1,
  cc: 1,
  l: 1000,
  litre: 1000,
  litres: 1000,
  liter: 1000,
  liters: 1000,
}

// Keywords in ingredient names that strongly suggest a liquid
const LIQUID_KEYWORDS = [
  'water', 'oil', 'milk', 'juice', 'vinegar', 'cream', 'broth', 'stock',
  'sauce', 'extract', 'syrup', 'wine', 'beer', 'cider', 'liquor', 'spirit',
  'soup', 'dressing', 'marinade', 'glaze', 'gravy', 'buttermilk', 'coconut milk',
  'yogurt', 'ketchup', 'soy', 'worcestershire', 'lemon juice', 'lime juice',
  'orange juice', 'honey', 'molasses', 'maple',
]

export function isLiquidIngredient(name: string): boolean {
  const n = name.toLowerCase()
  return LIQUID_KEYWORDS.some((k) => n.includes(k))
}

export interface ConversionResult {
  targetUnit: AllowedUnit
  /** Multiplier to apply to quantity: newQuantity = quantity * quantityFactor */
  quantityFactor: number
  /** Multiplier to apply to costPerUnit: newCost = costPerUnit * costFactor */
  costFactor: number
}

/**
 * Given a source unit and ingredient name, return how to convert to the best
 * allowed unit (g/kg/ml/L). Returns null if the unit is already allowed or
 * cannot be recognised.
 */
export function computeConversion(
  sourceUnit: string,
  ingredientName: string
): ConversionResult | null {
  const canonical = canonicalise(sourceUnit)
  if (isAllowedUnit(canonical)) {
    // Already fine; just return null to signal no conversion needed
    return null
  }

  const unitKey = sourceUnit.trim().toLowerCase()
  const liquid = isLiquidIngredient(ingredientName)

  if (liquid) {
    const toMl = LIQUID_TO_ML[unitKey]
    if (!toMl) return null
    // Convert quantity to ml or L
    const totalMl = toMl // per-unit factor
    if (totalMl >= 1000) {
      // Store in L
      return { targetUnit: 'L', quantityFactor: totalMl / 1000, costFactor: 1000 / totalMl }
    } else {
      // Store in ml (unless it would be > 1000 ml/unit, then L)
      return { targetUnit: 'ml', quantityFactor: totalMl, costFactor: 1 / totalMl }
    }
  } else {
    const toG = DRY_TO_GRAMS[unitKey]
    if (!toG) return null
    if (toG >= 1000) {
      return { targetUnit: 'kg', quantityFactor: toG / 1000, costFactor: 1000 / toG }
    } else {
      return { targetUnit: 'g', quantityFactor: toG, costFactor: 1 / toG }
    }
  }
}

/**
 * Convert a recipe unit/quantity to the best matching inventory unit.
 * Returns the converted quantity and the target inventory unit.
 * Used by Smart Chef when a recipe mentions cups/tbsp/tsp.
 */
export function convertRecipeToInventory(
  recipeQuantity: number,
  recipeUnit: string,
  ingredientName: string
): { quantity: number; unit: AllowedUnit } | null {
  const unitKey = recipeUnit.trim().toLowerCase()
  const liquid = isLiquidIngredient(ingredientName)

  if (liquid) {
    const toMl = LIQUID_TO_ML[unitKey]
    if (!toMl) return null
    const totalMl = recipeQuantity * toMl
    return totalMl >= 1000
      ? { quantity: totalMl / 1000, unit: 'L' }
      : { quantity: totalMl, unit: 'ml' }
  } else {
    const toG = DRY_TO_GRAMS[unitKey]
    if (!toG) return null
    const totalG = recipeQuantity * toG
    return totalG >= 1000
      ? { quantity: totalG / 1000, unit: 'kg' }
      : { quantity: totalG, unit: 'g' }
  }
}
