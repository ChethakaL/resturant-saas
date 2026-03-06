export interface TerminologyOverride {
  from: string
  to: string
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parse admin-provided overrides from a textarea.
 * Supported line formats:
 * - pita bread => Lebanese bread
 * - pita bread -> Lebanese bread
 * - pita bread: Lebanese bread
 */
export function parseTerminologyOverrides(raw: string | null | undefined): TerminologyOverride[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: TerminologyOverride[] = []
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const parts = line.split(/\s*(?:=>|->|:)\s*/)
    if (parts.length < 2) continue
    const from = parts[0]?.trim()
    const to = parts.slice(1).join(':').trim()
    if (!from || !to) continue
    const key = `${from.toLowerCase()}=>${to.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ from, to })
  }
  return out
}

export function buildTerminologyPromptBlock(overrides: TerminologyOverride[]): string {
  if (overrides.length === 0) {
    return `FOOD TERMINOLOGY:
- Use cuisine-accurate terms. Avoid generic wording when a culturally specific name is appropriate.`
  }
  const lines = overrides.map((rule) => `- Prefer "${rule.to}" instead of "${rule.from}".`).join('\n')
  return `FOOD TERMINOLOGY (RESTAURANT PREFERENCES):
${lines}
- Apply these preferences consistently in ingredient names, recipe text, and descriptions when relevant.`
}

export function applyTerminologyOverrides(text: string, overrides: TerminologyOverride[]): string {
  if (!text || overrides.length === 0) return text
  let out = text
  for (const rule of overrides) {
    const from = rule.from.trim()
    const to = rule.to.trim()
    if (!from || !to) continue
    out = out.replace(new RegExp(escapeRegExp(from), 'gi'), to)
  }
  return out
}

export function normalizeRecipeTerminology<T>(payload: T, overrides: TerminologyOverride[]): T {
  if (!payload || overrides.length === 0) return payload
  const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>

  const patchString = (value: unknown): unknown =>
    typeof value === 'string' ? applyTerminologyOverrides(value, overrides) : value

  if (typeof cloned.recipeName === 'string') cloned.recipeName = patchString(cloned.recipeName)
  if (typeof cloned.name === 'string') cloned.name = patchString(cloned.name)
  if (typeof cloned.categoryName === 'string') cloned.categoryName = patchString(cloned.categoryName)
  if (typeof cloned.description === 'string') cloned.description = patchString(cloned.description)
  if (typeof cloned.message === 'string') cloned.message = patchString(cloned.message)

  if (Array.isArray(cloned.steps)) {
    cloned.steps = cloned.steps.map((step) => patchString(step))
  }
  if (Array.isArray(cloned.tips)) {
    cloned.tips = cloned.tips.map((tip) => patchString(tip))
  }
  if (Array.isArray(cloned.recipeSteps)) {
    cloned.recipeSteps = cloned.recipeSteps.map((step) => patchString(step))
  }
  if (Array.isArray(cloned.recipeTips)) {
    cloned.recipeTips = cloned.recipeTips.map((tip) => patchString(tip))
  }
  if (Array.isArray(cloned.ingredients)) {
    cloned.ingredients = cloned.ingredients.map((ingredient) => {
      if (!ingredient || typeof ingredient !== 'object') return ingredient
      const obj = ingredient as Record<string, unknown>
      if (typeof obj.name === 'string') obj.name = patchString(obj.name)
      if (typeof obj.notes === 'string') obj.notes = patchString(obj.notes)
      return obj
    })
  }
  if (cloned.data && typeof cloned.data === 'object') {
    cloned.data = normalizeRecipeTerminology(cloned.data, overrides) as Record<string, unknown>
  }

  return cloned as T
}
