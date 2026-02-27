import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { callGemini, parseGeminiJson } from '@/lib/generative'
import { DEFAULT_CATEGORY_NAME } from '@/lib/menu-translation-seed'

type LanguageCode = 'en' | 'ar' | 'ar_fusha' | 'ku'

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  ar: 'Iraqi Arabic',
  ar_fusha: 'Arabic',
  ku: 'Sorani Kurdish',
}

function toNullableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const languageValue = (body.language as LanguageCode | undefined) ?? 'en'
    if (!LANGUAGE_LABELS[languageValue]) {
      return NextResponse.json(
        { error: 'Invalid language selection' },
        { status: 400 }
      )
    }

    const name = (body.name || '').trim()
    if (!name) {
      return NextResponse.json(
        { error: 'Item name is required' },
        { status: 400 }
      )
    }

    const description = (body.description || '').trim()
    const category = (body.category || DEFAULT_CATEGORY_NAME).trim() || DEFAULT_CATEGORY_NAME
    const price = toNullableNumber(body.price)
    const calories = toNullableNumber(body.calories)
    const protein = toNullableNumber(body.protein)
    const carbs = toNullableNumber(body.carbs)

    // When target language is English, we still need AI translation
    // because the source text may be in Arabic or Kurdish (if the management language is not English).
    // Only skip AI if the text is already obviously English (ASCII-only).
    const isSourceAscii = /^[\x00-\x7F]*$/.test(name + (description || ''))
    if (languageValue === 'en' && isSourceAscii) {
      return NextResponse.json({
        name,
        description,
        aiDescription: description,
        protein,
        carbs,
      })
    }

    const snippetLines = [
      `Name: ${name}`,
      `Category: ${category}`,
      `Description: ${description || 'No description provided'}`,
      `Price: ${price ?? 'unknown'}`,
      `Calories: ${calories ?? 'unknown'}`,
    ].join(' | ')

    const languageInstruction =
      languageValue === 'en'
        ? 'Translate into English. The source text may be in Arabic or Kurdish. Produce natural, appetizing English menu language.'
        : languageValue === 'ar_fusha'
          ? 'Translate into Fusha Arabic (Modern Standard Arabic). Do not translate word for word: translate the feeling and intent so the Arabic sounds natural and appetizing to a local diner. Use idiomatic, warm language suitable for a restaurant menu.'
          : languageValue === 'ar'
            ? 'Translate into Iraqi Arabic. Do not translate word for word: translate the feeling and intent so the Arabic sounds natural and appetizing. Use idiomatic Iraqi Arabic suitable for a restaurant menu.'
            : `Translate into ${LANGUAGE_LABELS[languageValue]}. Keep the tone and intent of the original; natural, appetizing menu language.`

    const prompt = `You are an imaginative chef rewriting menu content for local diners. ${languageInstruction}
Keep digits as ASCII. Return ONLY the JSON structure below with no extra text:
{
  "language": "${LANGUAGE_LABELS[languageValue]}",
  "items": [
    {
      "id": "preview",
      "name": "localized name",
      "description": "Concise ${LANGUAGE_LABELS[languageValue]} description",
      "aiDescription": "Two-sentence expressive story in ${LANGUAGE_LABELS[languageValue]}",
      "protein": 25,
      "carbs": 40
    }
  ]
}
Here is the menu item to translate:
${snippetLines}`

    const aiResult = await callGemini(prompt)
    const rawText = await aiResult.response.text()
    const payload = parseGeminiJson(rawText)
    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error('Missing translated item')
    }

    const translation = payload.items[0]
    return NextResponse.json({
      name: translation.name,
      description: translation.description,
      aiDescription: translation.aiDescription || '',
      protein:
        typeof translation.protein === 'number' ? translation.protein : null,
      carbs:
        typeof translation.carbs === 'number' ? translation.carbs : null,
    })
  } catch (error: any) {
    console.error('Error generating translation preview:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate translation preview',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
