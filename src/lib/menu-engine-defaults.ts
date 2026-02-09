import type { MenuEngineSettings } from '@/types/menu-engine'

export const DEFAULT_MENU_ENGINE_SETTINGS: MenuEngineSettings = {
  mode: 'classic',
  moodFlow: true,
  bundles: true,
  upsells: true,
  scarcityBadges: true,
  priceAnchoring: true,
  bundleCorrelationThreshold: 0.35,
  maxItemsPerCategory: 7,
  idleUpsellDelaySeconds: 6,
}

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
