import type { MenuEngineSettings } from '@/types/menu-engine'
import type { EngineMode } from '@/types/menu-engine'

/** Consultant-backed numbers used for optimization modes (profit + adaptive). */
const OPTIMIZED_NUMBERS = {
  maxItemsPerCategory: 7,
  maxInitialItemsPerCategory: 3,
  idleUpsellDelaySeconds: 6,
  bundleCorrelationThreshold: 0.35,
} as const

/** Basic / classic: normal menu only — categories and all items, no carousels or optimization. */
const PRESET_CLASSIC: MenuEngineSettings = {
  mode: 'classic',
  moodFlow: false,
  bundles: false,
  upsells: false,
  scarcityBadges: false,
  priceAnchoring: false,
  bundleCorrelationThreshold: 0.35,
  maxItemsPerCategory: 999,
  maxInitialItemsPerCategory: 999,
  idleUpsellDelaySeconds: 30,
}

/** Highlight My Most Profitable / Order by popularity and profitability: full suggestions, consultant numbers. */
const PRESET_OPTIMIZED_BASE: Omit<MenuEngineSettings, 'mode'> = {
  moodFlow: true,
  bundles: true,
  upsells: true,
  scarcityBadges: true,
  priceAnchoring: true,
  ...OPTIMIZED_NUMBERS,
}

const PRESET_PROFIT: MenuEngineSettings = { ...PRESET_OPTIMIZED_BASE, mode: 'profit' }
const PRESET_ADAPTIVE: MenuEngineSettings = { ...PRESET_OPTIMIZED_BASE, mode: 'adaptive' }

const PRESETS: Record<EngineMode, MenuEngineSettings> = {
  classic: PRESET_CLASSIC,
  profit: PRESET_PROFIT,
  adaptive: PRESET_ADAPTIVE,
}

/**
 * Resolve full menu engine settings from the stored mode.
 * Automation: the chosen card (mode) drives all suggestion and numeric settings via presets.
 */
export function getSettingsForMode(mode: EngineMode): MenuEngineSettings {
  return PRESETS[mode]
}

/** Default for backwards compatibility; equals classic preset. */
export const DEFAULT_MENU_ENGINE_SETTINGS: MenuEngineSettings = PRESET_CLASSIC

/** Mood option id → labels (en, ar, ku) for Rule 4 */
export const MOOD_LABELS: Record<string, { en: string; ar: string; ku: string }> = {
  light: { en: 'Something light', ar: 'شيء خفيف', ku: 'شتێکی سووک' },
  filling: { en: 'Something filling', ar: 'شيء مشبع', ku: 'شتێکی تەواو' },
  sharing: { en: 'Something to share', ar: 'لل مشاركة', ku: 'بۆ هاوبەشکردن' },
  premium: { en: 'Something premium', ar: 'مميز', ku: 'تایبەت' },
}

/** Category name keywords for auto-sorting / mood mapping (priority order for profit mode). */
export const CATEGORY_PRIORITY_KEYWORDS: Record<string, number> = {
  appetizer: 1,
  salad: 2,
  starter: 3,
  soup: 4,
  main: 5,
  grill: 6,
  burger: 7,
  pasta: 8,
  dessert: 9,
  drink: 10,
  beverage: 11,
  coffee: 12,
}

export const MOOD_CATEGORY_MAPPING: Record<string, string[]> = {
  light: ['salad', 'appetizer', 'starter', 'soup', 'light'],
  filling: ['main', 'grill', 'burger', 'pasta', 'rice'],
  sharing: ['platter', 'appetizer', 'starter', 'share'],
  premium: [], // Filled by STARs + high-price at runtime
}
