/**
 * Platform-wide configuration singleton.
 *
 * Priority: Database (PlatformConfig table) → process.env fallback.
 *
 * Usage:
 *   import { getPlatformConfig } from '@/lib/platform-config'
 *   const cfg = await getPlatformConfig()
 *   const key = cfg.geminiApiKey   // string | undefined
 *
 * This means you do NOT need to change every process.env reference.
 * Any code that uses process.env will still work as a fallback.
 * Code that wants the DB value should use this helper instead.
 */

import { prisma } from '@/lib/prisma'

export interface PlatformConfigValues {
  // AI API Keys
  geminiApiKey?: string
  openaiApiKey?: string
  anthropicApiKey?: string
  googleFontsApiKey?: string
  googleTranslateApiKey?: string
  tavilyApiKey?: string

  // Subscription Pricing (in USD)
  priceMonthly?: number
  priceAnnual?: number
  priceBranch?: number
  referralDiscountAmount?: number

  // Stripe
  stripeSecretKey?: string
  stripePriceIdMonthly?: string
  stripePriceIdAnnual?: string

  // Any additional custom keys
  [key: string]: unknown
}

let _cache: { values: PlatformConfigValues; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60 * 1000 // 1 minute cache

/** Fetch platform config from DB, with in-memory cache and .env fallback. */
export async function getPlatformConfig(): Promise<PlatformConfigValues> {
  const now = Date.now()
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.values
  }

  let dbConfig: Record<string, unknown> = {}
  try {
    const row = await prisma.platformConfig.findUnique({ where: { id: 'global' } })
    if (row?.config && typeof row.config === 'object') {
      dbConfig = row.config as Record<string, unknown>
    }
  } catch {
    // DB not reachable; fall back to .env
  }

  const values: PlatformConfigValues = {
    // AI keys — DB wins, then .env
    geminiApiKey: (dbConfig.geminiApiKey as string) || process.env.GOOGLE_AI_KEY || undefined,
    openaiApiKey: (dbConfig.openaiApiKey as string) || process.env.OPENAI_API_KEY || undefined,
    anthropicApiKey: (dbConfig.anthropicApiKey as string) || process.env.ANTHROPIC_API_KEY || undefined,
    googleFontsApiKey: (dbConfig.googleFontsApiKey as string) || process.env.GOOGLE_FONTS_API_KEY || undefined,
    googleTranslateApiKey: (dbConfig.googleTranslateApiKey as string) || process.env.GOOGLE_TRANSLATE_API_KEY || undefined,
    tavilyApiKey: (dbConfig.tavilyApiKey as string) || process.env.TAVILY_API_KEY || undefined,

    // Pricing — DB wins, then .env
    priceMonthly: (dbConfig.priceMonthly as number) || Number(process.env.STRIPE_PRICE_MONTHLY) || 59,
    priceAnnual: (dbConfig.priceAnnual as number) || Number(process.env.STRIPE_PRICE_ANNUAL) || 590,
    priceBranch: (dbConfig.priceBranch as number) || Number(process.env.STRIPE_PRICE_BRANCH) || 10,
    referralDiscountAmount: (dbConfig.referralDiscountAmount as number) || 10,

    // Stripe keys — DB wins, then .env
    stripeSecretKey: (dbConfig.stripeSecretKey as string) || process.env.STRIPE_SECRET_KEY || undefined,
    stripePriceIdMonthly: (dbConfig.stripePriceIdMonthly as string) || undefined,
    stripePriceIdAnnual: (dbConfig.stripePriceIdAnnual as string) || undefined,
  }

  _cache = { values, fetchedAt: now }
  return values
}

/** Invalidate the in-memory cache (call after saving new config). */
export function invalidatePlatformConfigCache() {
  _cache = null
}

/** Save platform config to DB (superadmin only). Merges with existing values. */
export async function savePlatformConfig(updates: Partial<PlatformConfigValues>): Promise<void> {
  const existing = await prisma.platformConfig.findUnique({ where: { id: 'global' } })
  const currentConfig = (existing?.config as Record<string, unknown>) ?? {}
  const merged = { ...currentConfig, ...updates }

  await prisma.platformConfig.upsert({
    where: { id: 'global' },
    update: { config: merged },
    create: { id: 'global', config: merged },
  })
  invalidatePlatformConfigCache()
}

/** Read the raw config object from DB (superadmin only — shows all stored values). */
export async function getRawPlatformConfig(): Promise<Record<string, unknown>> {
  const row = await prisma.platformConfig.findUnique({ where: { id: 'global' } })
  return (row?.config as Record<string, unknown>) ?? {}
}
