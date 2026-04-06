import { prisma } from '@/lib/prisma'
import { callGemini, parseGeminiJson } from '@/lib/generative'
import { normalizeUiSourceText } from '@/lib/i18n/server-ui-translations'
import { googleTranslateTexts, type GoogleTranslateOptions } from '@/lib/i18n/google-translate-api'
import { openaiBatchTranslateReceipt } from '@/lib/i18n/openai-receipt-translate'
import {
  buildReceiptLinesPrompt,
  type ReceiptTargetLocale,
} from '@/lib/i18n/receipt-lines-prompt'

export type { ReceiptTargetLocale }

/** v6: OpenAI-first for receipt lines (phonetic Arabic→English); busts stale Gemini/Google cache */
const MGMT_TRANSLATION_CACHE_PREFIX = '__mgmt_v6__:'

function receiptCacheKey(text: string): string {
  const n = normalizeUiSourceText(text)
  if (!n) return ''
  return `${MGMT_TRANSLATION_CACHE_PREFIX}${n}`
}

function toDbLocale(locale: ReceiptTargetLocale): string {
  if (locale === 'ar-fusha') return 'ar_fusha'
  return locale
}

async function geminiBatchTranslate(
  texts: string[],
  targetLocale: ReceiptTargetLocale
): Promise<string[] | null> {
  const input = JSON.stringify(texts)
  const prompt = buildReceiptLinesPrompt(targetLocale, input)

  try {
    const result = await callGemini(prompt)
    const raw = result.response.text()
    const parsed = parseGeminiJson(raw) as { lines?: string[] }
    if (!Array.isArray(parsed.lines) || parsed.lines.length !== texts.length) {
      console.warn('[receipt-translate] Gemini batch length mismatch')
      return null
    }
    return parsed.lines.map((s) => String(s ?? '').trim())
  } catch (e) {
    console.warn('[receipt-translate] Gemini batch failed', e)
    return null
  }
}

/**
 * Translates receipt strings to the dashboard language.
 * For **Arabic (Fusha)** dashboard locale, returns inputs unchanged — receipts are already Arabic; do not translate to English.
 * For **English / Kurdish**, order: OpenAI → Google Translate → Gemini. Caches under `__mgmt_v6__:`.
 */
export async function translateReceiptStringsToLocale(
  texts: string[],
  targetLocale: ReceiptTargetLocale
): Promise<string[]> {
  if (targetLocale === 'ar-fusha') {
    return texts.slice()
  }

  const hasOpenAI = !!process.env.OPENAI_API_KEY?.trim()
  const hasGoogle = !!process.env.GOOGLE_TRANSLATE_API_KEY?.trim()
  const hasGemini = !!process.env.GOOGLE_AI_KEY?.trim()

  if (!hasOpenAI && !hasGoogle && !hasGemini) {
    console.warn(
      '[receipt-translate] Set OPENAI_API_KEY (recommended for English receipt names), and/or GOOGLE_TRANSLATE_API_KEY, and/or GOOGLE_AI_KEY'
    )
    return texts
  }

  const out = texts.slice()
  const dbLocale = toDbLocale(targetLocale)

  const indicesToTranslate: number[] = []
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i] ?? ''
    if (!normalizeUiSourceText(t)) continue
    indicesToTranslate.push(i)
  }

  if (indicesToTranslate.length === 0) return out

  const keyByIndex = new Map<number, string>()
  const uniqueKeys = new Map<string, string>()
  for (const i of indicesToTranslate) {
    const key = receiptCacheKey(texts[i]!)
    if (!key) continue
    keyByIndex.set(i, key)
    if (!uniqueKeys.has(key)) uniqueKeys.set(key, texts[i]!)
  }

  const keys = [...uniqueKeys.keys()]
  let cacheHits: { sourceText: string; translatedText: string }[] = []
  try {
    cacheHits = await prisma.uiTranslation.findMany({
      where: { locale: dbLocale, sourceText: { in: keys } },
      select: { sourceText: true, translatedText: true },
    })
  } catch (e) {
    console.warn('[receipt-translate] cache read failed', e)
  }

  const cacheMap = new Map(cacheHits.map((c) => [c.sourceText, c.translatedText]))
  const missingKeys = keys.filter((k) => !cacheMap.has(k))

  if (missingKeys.length > 0) {
    const payload = missingKeys.map((k) => uniqueKeys.get(k)!)

    const googleOpts: GoogleTranslateOptions | undefined =
      targetLocale === 'en' || targetLocale === 'ku' ? { source: 'ar' } : undefined

    let resolved: string[] | null = null

    if (hasOpenAI) {
      resolved = await openaiBatchTranslateReceipt(payload, targetLocale)
    }

    if (!resolved || resolved.length !== payload.length) {
      if (hasGoogle) {
        const google = await googleTranslateTexts(payload, targetLocale, googleOpts)
        if (google && google.length === payload.length) {
          resolved = google
        }
      }
    }

    if (!resolved || resolved.length !== payload.length) {
      if (hasGemini) {
        const batch = await geminiBatchTranslate(payload, targetLocale)
        if (batch && batch.length === payload.length) {
          resolved = batch
        }
      }
    }

    if (!resolved || resolved.length !== payload.length) {
      resolved = payload
    }

    for (let j = 0; j < missingKeys.length; j++) {
      const k = missingKeys[j]!
      const tr = resolved[j] ?? payload[j]!
      cacheMap.set(k, tr)
      try {
        await prisma.uiTranslation.upsert({
          where: { sourceText_locale: { sourceText: k, locale: dbLocale } },
          create: { sourceText: k, locale: dbLocale, translatedText: tr },
          update: { translatedText: tr },
        })
      } catch (e) {
        console.warn('[receipt-translate] cache upsert failed', e)
      }
    }
  }

  for (const i of indicesToTranslate) {
    const key = keyByIndex.get(i)
    if (key && cacheMap.has(key)) {
      out[i] = cacheMap.get(key)!
    }
  }

  return out
}

export function normalizeReceiptManagementLocale(locale: string): ReceiptTargetLocale {
  const l = String(locale || 'en').replace('ar_fusha', 'ar-fusha')
  if (l === 'ar-fusha' || l === 'ar_fusha') return 'ar-fusha'
  if (l === 'ku') return 'ku'
  return 'en'
}
