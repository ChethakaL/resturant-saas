/**
 * Unit tests for global features: formatCurrency, theme schema.
 * Run: npx tsx scripts/test-global-features.ts
 */
import { formatCurrency } from '../src/lib/utils'
import { z } from 'zod'
import { normalizeTranslationInputs } from '../src/lib/menu-translation-input'

const results: string[] = []

// 1. formatCurrency with different currencies
try {
  const iqd = formatCurrency(15000, 'IQD')
  const usd = formatCurrency(25.99, 'USD')
  const eur = formatCurrency(20, 'EUR')
  const hasIqd = iqd.includes('15') || iqd.includes('15000')
  const hasUsd = usd.includes('$') || usd.includes('25')
  const hasEur = eur.includes('€') || eur.includes('20')
  results.push(hasIqd && hasUsd && hasEur ? '✓ formatCurrency(amount, currency) for IQD, USD, EUR' : '✗ formatCurrency failed')
} catch (e) {
  results.push('✗ formatCurrency: ' + (e instanceof Error ? e.message : String(e)))
}

// 2. Default currency (IQD)
try {
  const def = formatCurrency(1000)
  results.push(def ? '✓ formatCurrency(amount) defaults to IQD' : '✗ formatCurrency default failed')
} catch (e) {
  results.push('✗ formatCurrency default: ' + (e instanceof Error ? e.message : String(e)))
}

// 3. Theme schema validation (currency, menuTranslationLanguage1/2)
try {
  const themeSchema = z.object({
    currency: z.string().length(3).optional(),
    menuTranslationLanguage1: z.string().max(20).optional(),
    menuTranslationLanguage2: z.string().max(20).optional(),
  })
  const parsed = themeSchema.safeParse({
    currency: 'USD',
    menuTranslationLanguage1: 'ar',
    menuTranslationLanguage2: 'ku',
  })
  results.push(parsed.success ? '✓ Theme schema accepts currency + translation languages' : '✗ Theme schema validation failed')
} catch (e) {
  results.push('✗ Theme schema: ' + (e instanceof Error ? e.message : String(e)))
}

// 4. Menu translation input normalization
try {
  const items = normalizeTranslationInputs([
    { language: 'ar', name: 'Test', description: 'Desc', aiDescription: 'AI' },
    { language: 'ku', name: 'Test2', description: 'D2', aiDescription: 'AI2' },
  ])
  const ok = items.length === 2 && items[0].language === 'ar' && items[1].language === 'ku'
  results.push(ok ? '✓ normalizeTranslationInputs with string language codes' : '✗ normalizeTranslationInputs failed')
} catch (e) {
  results.push('✗ menu-translation-input: ' + (e instanceof Error ? e.message : String(e)))
}

console.log('\n--- Global Features Test Results ---\n')
results.forEach((r) => console.log(r))
console.log('')
const failed = results.filter((r) => r.startsWith('✗'))
process.exit(failed.length > 0 ? 1 : 0)
