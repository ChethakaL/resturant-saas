/**
 * Smart Menu Revenue Optimization Engine — shared types.
 * All margin/cost/quadrant data stays server-side; only display-safe hints reach the client.
 */

export type EngineMode = 'classic' | 'profit' | 'adaptive'

export type MenuQuadrant = 'STAR' | 'WORKHORSE' | 'PUZZLE' | 'DOG'

/** Display-safe hints attached to each menu item (no margin/cost). */
export interface ItemDisplayHints {
  displayTier: 'hero' | 'featured' | 'standard' | 'minimal'
  position: number
  showImage: boolean
  /** Formatted price string, no currency symbol (e.g. "12,000") */
  priceDisplay: string
  /** Optional: slight reduction for "Today's Selection" etc.; no discount wording. 0-100. */
  priceModifierPercent?: number
  isAnchor: boolean
  subGroup?: string
  isLimitedToday: boolean
  badgeText?: string
  scrollDepthHide: boolean
  moodTags: string[]
}

export interface BundleHint {
  id: string
  name: string
  itemIds: string[]
  bundlePrice: number
  originalPrice: number
  savingsText: string
}

export type UpsellStage = 'protein_upgrade' | 'premium_side' | 'beverage' | 'dessert'

export interface UpsellSuggestion {
  stage: UpsellStage
  itemId: string
  nudgeText: string
}

export interface MoodOption {
  id: string
  label: { en: string; ar: string; ku: string }
  itemIds: string[]
}

export interface MenuEngineSettings {
  mode: EngineMode
  moodFlow: boolean
  bundles: boolean
  upsells: boolean
  scarcityBadges: boolean
  priceAnchoring: boolean
  bundleCorrelationThreshold: number
  maxItemsPerCategory: number
  /** Max items shown before "See more" per category (decision flow). Default 3. */
  maxInitialItemsPerCategory?: number
  idleUpsellDelaySeconds: number
}

export interface MenuEngineOutput {
  engineMode: EngineMode
  categoryOrder: string[]
  itemHints: Record<string, ItemDisplayHints>
  bundles: BundleHint[]
  moods: MoodOption[]
  upsellMap: Record<string, UpsellSuggestion[]>
  /** When category has no high-priced item, bundle to show as anchor (per category id). */
  categoryAnchorBundle?: Record<string, BundleHint>
}
