export const DEFAULT_CATEGORY_NAME = 'Chef specials'

type NumericInput = string | number | null | undefined

function parseNumberInput(value?: NumericInput) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export interface TranslationSeedPayload {
  name: string
  description: string
  category: string
  price: number | null
  calories: number | null
  protein: number | null
  carbs: number | null
}

export interface TranslationSeed {
  payload: TranslationSeedPayload
  signature: string
}

export interface BuildTranslationSeedParams {
  name?: string
  description?: string
  categoryName?: string
  price?: NumericInput
  calories?: NumericInput
  protein?: NumericInput
  carbs?: NumericInput
}

export function buildTranslationSeed({
  name,
  description,
  categoryName,
  price,
  calories,
  protein,
  carbs,
}: BuildTranslationSeedParams): TranslationSeed | null {
  const trimmedName = (name || '').trim()
  const trimmedDescription = (description || '').trim()

  if (!trimmedName && !trimmedDescription) {
    return null
  }

  const normalizedCategory = (categoryName || '').trim() || DEFAULT_CATEGORY_NAME

  const payload: TranslationSeedPayload = {
    name: trimmedName,
    description: trimmedDescription,
    category: normalizedCategory,
    price: parseNumberInput(price),
    calories: parseNumberInput(calories),
    protein: parseNumberInput(protein),
    carbs: parseNumberInput(carbs),
  }

  return {
    payload,
    signature: JSON.stringify(payload),
  }
}
