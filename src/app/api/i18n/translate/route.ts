import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callGemini } from '@/lib/generative'

const SUPPORTED_LOCALES = ['ku', 'ar-fusha', 'ar_fusha'] as const
type TargetLocale = (typeof SUPPORTED_LOCALES)[number]

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const text = searchParams.get('text')?.trim()
    const locale = (searchParams.get('locale') || 'en').replace('ar_fusha', 'ar-fusha')

    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    const sourceText = normalizeText(text)

    if (locale === 'en') {
      return NextResponse.json({ translated: sourceText, fromCache: false })
    }

    const targetLocale = SUPPORTED_LOCALES.includes(locale as TargetLocale)
      ? (locale as TargetLocale)
      : null
    if (!targetLocale) {
      return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 })
    }

    const dbLocale = targetLocale.replace('ar-fusha', 'ar_fusha')

    const existing = await prisma.uiTranslation.findUnique({
      where: {
        sourceText_locale: { sourceText, locale: dbLocale },
      },
    })

    if (existing) {
      return NextResponse.json({ translated: existing.translatedText, fromCache: true })
    }

    const translated = await translateWithAI(sourceText, targetLocale)

    await prisma.uiTranslation.upsert({
      where: {
        sourceText_locale: { sourceText, locale: dbLocale },
      },
      create: { sourceText, locale: dbLocale, translatedText: translated },
      update: { translatedText: translated },
    })

    return NextResponse.json({ translated, fromCache: false })
  } catch (error) {
    console.error('[i18n/translate]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Translation failed' },
      { status: 500 }
    )
  }
}
