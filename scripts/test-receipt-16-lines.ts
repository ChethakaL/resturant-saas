/**
 * Runs the same OpenAI receipt prompt used in production on all 16 Arabic lines
 * from the Tishk invoice (reference image). No DB writes.
 *
 * Usage: npx tsx scripts/test-receipt-16-lines.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

function loadEnvFromDotenv() {
  try {
    const p = join(process.cwd(), '.env')
    const raw = readFileSync(p, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch {
    /* no .env */
  }
}

loadEnvFromDotenv()

import { openaiBatchTranslateReceipt } from '../src/lib/i18n/openai-receipt-translate'

/** Product column text as printed on the invoice (invoice #8876). */
const INVOICE_16_LINES = [
  'كندر بوينو شيرة 43*30',
  'نستلة البيبي 52*18',
  'نستلة سيارر 52*18',
  'كندر هاني حوب 30*28',
  'كندر كارشرى (23.50*20)',
  'أوريو تسكويت (35*12)',
  'جيس جدمو بانوس 62*30',
  'جيس دوريتوس 110*23',
  'جيس ذرا هدورتوس اصلى 100*12',
  'جيس دوريتوس الهين هرت مشرم 60*40',
  'نستلة دتسي دشمان 23*24',
  'نستلة داسك ريتر 20*16',
  'كبويرس ريتر 25*72',
  'كندر كاربر (25.6*5)*20',
  'ميلكا كركوكو 40*24',
  'كندر بينبيوى 30*30',
]

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('Set OPENAI_API_KEY in .env to run this check.')
    process.exit(1)
  }

  console.log('Model:', process.env.OPENAI_RECEIPT_TRANSLATE_MODEL?.trim() || 'gpt-4o-mini')
  console.log('---\n')

  const out = await openaiBatchTranslateReceipt(INVOICE_16_LINES, 'en')
  if (!out || out.length !== INVOICE_16_LINES.length) {
    console.error('openaiBatchTranslateReceipt failed or length mismatch')
    process.exit(1)
  }

  INVOICE_16_LINES.forEach((ar, i) => {
    console.log(`${String(i + 1).padStart(2, '0')}. ${ar}`)
    console.log(`    → ${out[i]}`)
    console.log('')
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
