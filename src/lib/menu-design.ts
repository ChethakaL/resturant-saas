import { z } from 'zod'

export const MENU_TEMPLATE_MARKERS = [
  'restaurant-name',
  'category-nav',
  'featured-slider',
  'menu-items',
  'cart',
] as const

export const menuDesignConfigSchema = z.object({
  mode: z.enum(['standard', 'custom']).default('standard'),
  preset: z.enum(['classic', 'modern', 'minimal', 'bold']).default('classic'),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1c1c1e'),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e8440a'),
  chefPickColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e8440a'),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#d7c9bf'),
  backgroundStyle: z.enum(['light', 'dark', 'gradient']).default('light'),
  fontFamily: z.string().trim().min(1).max(100).default('DM Sans'),
  fontMenuTitle: z.string().trim().min(1).max(100).default('DM Sans'),
  fontCategoryHeader: z.string().trim().min(1).max(100).default('DM Sans'),
  fontItemName: z.string().trim().min(1).max(100).default('DM Sans'),
  fontDescription: z.string().trim().min(1).max(100).default('DM Sans'),
  fontPrice: z.string().trim().min(1).max(100).default('DM Sans'),
  menuLayout: z.enum(['list', 'grid']).default('list'),
  menuCarouselStyle: z.enum(['sliding', 'static']).default('sliding'),
  cardStyle: z.enum(['compact', 'comfortable', 'image-first']).default('comfortable'),
  cornerStyle: z.enum(['square', 'soft', 'rounded']).default('soft'),
  showItemImages: z.boolean().default(true),
  showDescriptions: z.boolean().default(true),
  showCalories: z.boolean().default(true),
})

export type MenuDesignConfig = z.infer<typeof menuDesignConfigSchema>

export const DEFAULT_MENU_DESIGN: MenuDesignConfig = menuDesignConfigSchema.parse({})

export function menuDesignFromLegacyTheme(
  settings: Record<string, unknown>,
): MenuDesignConfig {
  const theme = (settings.theme as Record<string, unknown>) || {}
  const engine = (settings.menuEngine as Record<string, unknown>) || {}
  return menuDesignConfigSchema.parse({
    ...DEFAULT_MENU_DESIGN,
    primaryColor: theme.primaryColor,
    accentColor: theme.accentColor,
    chefPickColor: theme.chefPickColor,
    borderColor: theme.borderColor,
    backgroundStyle: theme.backgroundStyle,
    fontFamily: theme.fontFamily,
    fontMenuTitle: theme.fontMenuTitle,
    fontCategoryHeader: theme.fontCategoryHeader,
    fontItemName: theme.fontItemName,
    fontDescription: theme.fontDescription,
    fontPrice: theme.fontPrice,
    menuCarouselStyle: theme.menuCarouselStyle,
    menuLayout: engine.menuLayout,
  })
}

export type TemplateValidationResult =
  | { valid: true; html: string }
  | { valid: false; errors: string[] }

export function validateCustomMenuHtml(input: string): TemplateValidationResult {
  const html = input.trim()
  const errors: string[] = []

  if (!html) errors.push('HTML is required.')
  if (html.length > 200_000) errors.push('HTML must be smaller than 200 KB.')
  if (/<script\b/i.test(html)) errors.push('Script tags are not allowed. iServe provides the menu runtime.')
  if (/<(?:iframe|object|embed|form|base|meta)\b/i.test(html)) {
    errors.push('iframe, object, embed, form, base, and meta elements are not allowed.')
  }
  if (/\son[a-z]+\s*=/i.test(html)) errors.push('Inline event handlers such as onclick are not allowed.')
  if (/javascript\s*:/i.test(html)) errors.push('javascript: URLs are not allowed.')
  if (/<style\b[^>]*>[\s\S]*?@import/i.test(html)) errors.push('CSS @import is not allowed.')

  for (const marker of MENU_TEMPLATE_MARKERS) {
    const pattern = new RegExp(`data-iserve\\s*=\\s*["']${marker}["']`, 'i')
    if (!pattern.test(html)) errors.push(`Missing required marker: data-iserve="${marker}".`)
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, html }
}

export function designConfigToTheme(config: MenuDesignConfig): Record<string, unknown> {
  const font = config.fontFamily || 'DM Sans'
  return {
    primaryColor: config.primaryColor,
    accentColor: config.accentColor,
    chefPickColor: config.chefPickColor,
    borderColor: config.borderColor,
    backgroundStyle: config.backgroundStyle,
    fontFamily: font,
    fontMenuTitle: font,
    fontCategoryHeader: font,
    fontItemName: font,
    fontDescription: font,
    fontPrice: font,
    menuLayout: config.menuLayout,
    menuCarouselStyle: config.menuCarouselStyle,
    cardStyle: config.cardStyle,
    cornerStyle: config.cornerStyle,
    showItemImages: config.showItemImages,
    showDescriptions: config.showDescriptions,
    showCalories: config.showCalories,
  }
}
