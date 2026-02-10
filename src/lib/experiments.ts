/**
 * Client-side A/B experiment assignment and persistence.
 * Used for price tests, photo vs no-photo, upsell strategy, etc.
 */

const STORAGE_KEY = 'iserve_experiments'

export type ExperimentId =
  | 'price_format'      // 18 vs 17.9 vs 18.5
  | 'photo_visibility' // show vs hide image
  | 'upsell_strategy'   // sequential vs bundled

export type VariantId = string

export interface ExperimentConfig {
  variants: VariantId[]
  defaultVariant: VariantId
}

export const EXPERIMENTS: Record<ExperimentId, ExperimentConfig> = {
  price_format: {
    variants: ['whole', 'decimal_9', 'decimal_5'],
    defaultVariant: 'whole',
  },
  photo_visibility: {
    variants: ['show', 'hide'],
    defaultVariant: 'show',
  },
  upsell_strategy: {
    variants: ['sequential', 'bundled'],
    defaultVariant: 'sequential',
  },
}

let cache: Record<string, VariantId> | null = null

function load(): Record<string, VariantId> {
  if (typeof window === 'undefined') return {}
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cache = raw ? (JSON.parse(raw) as Record<string, VariantId>) : {}
  } catch {
    cache = {}
  }
  return cache
}

function save(assignments: Record<string, VariantId>) {
  cache = assignments
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments))
  } catch {}
}

/**
 * Get assigned variant for an experiment. Assigns randomly on first visit and persists.
 */
export function getVariant(experimentId: ExperimentId): VariantId {
  const config = EXPERIMENTS[experimentId]
  if (!config) return config.defaultVariant
  const assignments = load()
  if (assignments[experimentId]) return assignments[experimentId]
  const idx = Math.floor(Math.random() * config.variants.length)
  const variant = config.variants[idx]
  assignments[experimentId] = variant
  save(assignments)
  return variant
}

/**
 * Get all current assignments (for event logging).
 */
export function getAllVariants(): Record<string, VariantId> {
  return { ...load() }
}
