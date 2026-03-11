import { prisma } from '@/lib/prisma'
import { callGemini } from '@/lib/generative'

export function normalizeUiSourceText(value: string) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function toDbLocale(locale: string) {
  if (locale === 'ar-fusha' || locale === 'ar_fusha') return 'ar_fusha'
  if (locale === 'ku') return 'ku'
  return 'en'
}

async function translateWithAI(sourceText: string, targetLocale: string): Promise<string> {
  const langInstruction =
    targetLocale === 'ku'
      ? 'Translate into Sorani Kurdish (کوردی سۆرانی). Use natural, clear language for a restaurant management UI.'
      : targetLocale === 'ar-fusha' || targetLocale === 'ar_fusha'
        ? 'Translate into Fusha Arabic (العربية الفصحى). Use natural, clear language for a restaurant management UI.'
        : 'Return the text as-is.'

  const prompt = `Translate this UI string for a restaurant management system. ${langInstruction}
Keep it concise. Preserve placeholders like {0}, {1} if present.
Return ONLY the translated text, no quotes or extra text.

Original: ${sourceText}

Translation:`

  const result = await callGemini(prompt)
  const text = result.response.text()
  const translated = text.trim().replace(/^["']|["']$/g, '').trim()
  return translated || sourceText
}

export async function resolveUiTranslationMap(sourceTexts: string[], locale: string) {
  const dbLocale = toDbLocale(locale)
  const normalizedTexts = Array.from(new Set(sourceTexts.map(normalizeUiSourceText).filter(Boolean)))

  if (dbLocale === 'en' || normalizedTexts.length === 0) {
    return {} as Record<string, string>
  }

  const existing = await prisma.uiTranslation.findMany({
    where: {
      locale: dbLocale,
      sourceText: { in: normalizedTexts },
    },
    select: {
      sourceText: true,
      translatedText: true,
    },
  })

  const map = Object.fromEntries(existing.map((entry) => [entry.sourceText, entry.translatedText]))
  const missing = normalizedTexts.filter((text) => !map[text])

  if (missing.length === 0) {
    return map
  }

  const generated = await Promise.all(
    missing.map(async (sourceText) => {
      const translatedText = await translateWithAI(sourceText, dbLocale)
      await prisma.uiTranslation.upsert({
        where: {
          sourceText_locale: { sourceText, locale: dbLocale },
        },
        create: {
          sourceText,
          locale: dbLocale,
          translatedText,
        },
        update: {
          translatedText,
        },
      })
      return [sourceText, translatedText] as const
    })
  )

  return {
    ...map,
    ...Object.fromEntries(generated),
  }
}
