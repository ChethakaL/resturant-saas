/** Matches dashboard / receipt translation targets */
import { getPlatformConfig } from '../platform-config'
export type GoogleTranslateTarget = 'en' | 'ar-fusha' | 'ku'

/**
 * Google Cloud Translation API v2 (same core service as translate.google.com).
 * @see https://cloud.google.com/translate/docs/reference/rest/v2/translate
 *
 * Set GOOGLE_TRANSLATE_API_KEY in .env (API key with Cloud Translation API enabled).
 */
const TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2'

/** Max segments per request (stay under quota; API allows many). */
const CHUNK = 80

export type GoogleTranslateOptions = {
  /**
   * Force source language (disables auto-detect for the batch).
   * Use `ar` for Iraqi wholesale receipts → English/Kurdish so lines are not mis-detected as English/Persian.
   */
  source?: string
}

function targetLanguageCode(locale: GoogleTranslateTarget): string {
  if (locale === 'en') return 'en'
  if (locale === 'ku') return 'ckb'
  return 'ar'
}

export async function googleTranslateTexts(
  texts: string[],
  targetLocale: GoogleTranslateTarget,
  options?: GoogleTranslateOptions
): Promise<string[] | null> {
  const config = await getPlatformConfig()
  const apiKey = (config.googleTranslateApiKey ?? process.env.GOOGLE_TRANSLATE_API_KEY)?.trim()
  if (!apiKey) return null

  const target = targetLanguageCode(targetLocale)
  const out: string[] = []
  const safe = texts.map((t) => (t == null ? '' : String(t)))

  async function postChunk(chunk: string[], tgt: string) {
    return fetch(`${TRANSLATE_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: chunk,
        target: tgt,
        format: 'text',
        ...(options?.source ? { source: options.source } : {}),
      }),
    })
  }

  for (let i = 0; i < safe.length; i += CHUNK) {
    const chunk = safe.slice(i, i + CHUNK)
    try {
      let res = await postChunk(chunk, target)
      if (!res.ok && targetLocale === 'ku' && target === 'ckb') {
        const errText = await res.text()
        console.warn('[google-translate-api] ckb failed, retrying ku', errText.slice(0, 120))
        res = await postChunk(chunk, 'ku')
      }
      if (!res.ok) {
        const errText = await res.text()
        console.warn('[google-translate-api]', res.status, errText.slice(0, 200))
        return null
      }

      const data = (await res.json()) as {
        data?: { translations?: Array<{ translatedText?: string }> }
      }
      const rows = data.data?.translations
      if (!Array.isArray(rows) || rows.length !== chunk.length) {
        console.warn('[google-translate-api] length mismatch')
        return null
      }
      for (const row of rows) {
        out.push(String(row?.translatedText ?? '').trim())
      }
    } catch (e) {
      console.warn('[google-translate-api] request failed', e)
      return null
    }
  }

  return out
}
