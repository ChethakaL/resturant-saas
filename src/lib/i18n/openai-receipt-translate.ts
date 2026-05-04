import OpenAI from 'openai'
import { parseGeminiJson } from '@/lib/generative'
import { getPlatformConfig } from '../platform-config'
import {
  buildReceiptLinesPrompt,
  type ReceiptTargetLocale,
} from '@/lib/i18n/receipt-lines-prompt'

const DEFAULT_MODEL = 'gpt-4o-mini'

/**
 * Batch-translates receipt strings using OpenAI (often better than Google Translate on
 * phonetic Arabic brand spellings). Use when OPENAI_API_KEY is set.
 */
export async function openaiBatchTranslateReceipt(
  texts: string[],
  targetLocale: ReceiptTargetLocale
): Promise<string[] | null> {
  const config = await getPlatformConfig()
  const apiKey = (config.openaiApiKey ?? process.env.OPENAI_API_KEY)?.trim()
  if (!apiKey) return null

  const model = process.env.OPENAI_RECEIPT_TRANSLATE_MODEL?.trim() || DEFAULT_MODEL
  const input = JSON.stringify(texts)
  const prompt = buildReceiptLinesPrompt(targetLocale, input)

  try {
    const openai = new OpenAI({ apiKey })
    const res = await openai.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = res.choices[0]?.message?.content
    if (!raw) {
      console.warn('[openai-receipt-translate] empty response')
      return null
    }
    const parsed = parseGeminiJson(raw) as { lines?: string[] }
    if (!Array.isArray(parsed.lines) || parsed.lines.length !== texts.length) {
      console.warn('[openai-receipt-translate] lines length mismatch')
      return null
    }
    return parsed.lines.map((s) => String(s ?? '').trim())
  } catch (e) {
    console.warn('[openai-receipt-translate] failed', e)
    return null
  }
}
