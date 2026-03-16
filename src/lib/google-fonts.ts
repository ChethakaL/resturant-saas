/**
 * Google Fonts Integration
 * The canonical source of truth for all Google Fonts now comes from the 
 * /api/fonts endpoint which caches Google's live API data, but we keep 
 * this layer strictly distinct for typings and URL generation.
 */

export interface GoogleFont {
  family: string
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace'
}

/** 
 * Map from legacy short-key (used in old DB rows) → real Google Font family name. 
 */
export const LEGACY_FONT_KEY_MAP: Record<string, string> = {
  sans:        'DM Sans',
  serif:       'Playfair Display',
  display:     'Cormorant Garamond',
  mono:        'Space Mono',
  rounded:     'Nunito',
  handwritten: 'Caveat',
  condensed:   'Barlow Condensed',
  slab:        'Roboto Slab',
}

/**
 * Resolve a fontFamily value (legacy short key OR a real Google Font name)
 * to the canonical font-family name to pass to Google Fonts.
 */
export function resolveGoogleFont(value: string | null | undefined): string {
  if (!value) return 'DM Sans'
  return LEGACY_FONT_KEY_MAP[value] ?? value
}

/**
 * Build a Google Fonts CSS import URL for a given font family.
 * Requests standard weights for restaurant menu elements.
 */
export function googleFontUrl(family: string): string {
  const encoded = encodeURIComponent(family)
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;600;700&display=swap`
}

/** Category display labels for the UI */
export const FONT_CATEGORY_LABELS: Record<string, string> = {
  'sans-serif':  'Sans-Serif',
  'serif':       'Serif',
  'display':     'Display',
  'handwriting': 'Handwriting',
  'monospace':   'Monospace',
}

/** 
 * The default top 8 UI suggestions shown immediately before any API search.
 */
export const DEFAULT_FONT_SUGGESTIONS: GoogleFont[] = [
  { family: 'DM Sans', category: 'sans-serif' },
  { family: 'Playfair Display', category: 'serif' },
  { family: 'Cormorant Garamond', category: 'serif' },
  { family: 'Space Mono', category: 'monospace' },
  { family: 'Nunito', category: 'sans-serif' },
  { family: 'Caveat', category: 'handwriting' },
  { family: 'Barlow Condensed', category: 'sans-serif' },
  { family: 'Roboto Slab', category: 'serif' },
]
