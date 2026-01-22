import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import type {
  MenuItemTranslation,
  MenuItemTranslationLanguage,
} from '@prisma/client'
import { callGemini, parseGeminiJson } from '@/lib/generative'

type LanguageCode = 'en' | 'ar' | 'ku'

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  ar: 'Iraqi Arabic',
  ku: 'Sorani Kurdish',
}

const CHUNK_SIZE = 10

interface TranslationRequestItem {
  id: string
  name: string
  description?: string | null
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  category?: string | null
  price?: number | null
  updatedAt?: string | null
}

interface TranslatedItemPayload {
  id: string
  name: string
  description: string
  aiDescription: string
  protein?: number | null
  carbs?: number | null
}

function buildSourceFingerprint(item: TranslationRequestItem) {
  const payload = {
    name: (item.name || '').trim(),
    description: (item.description || '').trim(),
    category: item.category?.trim() || 'Chef specials',
    price: item.price ?? 0,
    calories: item.calories ?? 0,
    protein: item.protein ?? null,
    carbs: item.carbs ?? null,
  }
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function buildSnippetLine(item: TranslationRequestItem) {
  const lineParts = [
    `- ID: ${item.id}`,
    `Name: ${item.name}`,
    `Category: ${item.category || 'Chef specials'}`,
    `Description: ${item.description || 'No description provided'}`,
    `Price: ${item.price ?? 'unknown'}`,
    `Calories: ${item.calories ?? 'unknown'}`,
  ]
  return lineParts.join(' | ')
}

async function translateChunk(
  lang: LanguageCode,
  languageLabel: string,
  chunk: TranslationRequestItem[]
) {
  const snippet = chunk.map(buildSnippetLine).join('\n')
  const prompt = `You are an imaginative Iraqi chef rewriting menu content for local diners in ${languageLabel}. Translate every text element below, keep digits as they already appear (do NOT convert them to Arabic-script numerals), and return the following EXACT JSON structure with no extra text:\n{\n  "language": "${languageLabel}",\n  "items": [\n    {\n      "id": "item-id",\n      "name": "localized name",\n      "description": "Concise ${languageLabel} description",\n      "aiDescription": "Two-sentence expressive story in ${languageLabel}",\n      "protein": 25,\n      "carbs": 40\n    }\n  ]\n}\nEach entry must keep the original ID, include a localized name, a short description, an AI-crafted story, and integer protein/carbs estimates. Numbers should stay as ASCII digits. Here are the items to translate:\n${snippet}`

  const aiResult = await callGemini(prompt)
  const rawText = aiResult.response.text()
  const payload = parseGeminiJson(rawText)
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('Translation payload missing items array')
  }
  return payload.items as TranslatedItemPayload[]
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GOOGLE_AI_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    let body
    try {
      body = await request.json()
    } catch (error) {
      console.error('Invalid translation request payload', error)
      return NextResponse.json(
        { error: 'Invalid translation request body' },
        { status: 400 }
      )
    }

    const { language, items } = body
    const languageValue = language as LanguageCode
    if (!languageValue || !LANGUAGE_LABELS[languageValue]) {
      return NextResponse.json(
        { error: 'Invalid language selection' },
        { status: 400 }
      )
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { language: LANGUAGE_LABELS[language as LanguageCode], items: [] }
      )
    }

    const sanitizedItems = items
      .filter((item: any) => item?.id && typeof item.id === 'string')
      .map((item: any) => ({
        id: item.id,
        name: item.name || 'Menu item',
        description: item.description || '',
        calories:
          typeof item.calories === 'number' ? item.calories : null,
        protein:
          typeof item.protein === 'number' ? item.protein : null,
        carbs: typeof item.carbs === 'number' ? item.carbs : null,
        category: item.category || 'Chef specials',
        price: typeof item.price === 'number' ? item.price : null,
        updatedAt: item.updatedAt || null,
      })) as TranslationRequestItem[]

    if (sanitizedItems.length === 0) {
      return NextResponse.json(
        { language: LANGUAGE_LABELS[language as LanguageCode], items: [] }
      )
    }

    if (languageValue === 'en') {
      return NextResponse.json({
        language: LANGUAGE_LABELS.en,
        items: sanitizedItems.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          aiDescription: item.description || '',
          protein: item.protein,
          carbs: item.carbs,
        })),
      })
    }

    const languageLabel = LANGUAGE_LABELS[languageValue]
    const languageEnum = languageValue as MenuItemTranslationLanguage

    const existingTranslations = await prisma.menuItemTranslation.findMany({
      where: {
        menuItemId: { in: sanitizedItems.map((item) => item.id) },
        language: languageEnum,
      },
    })

    const translationById = new Map<string, MenuItemTranslation>()
    existingTranslations.forEach((translation) => {
      translationById.set(translation.menuItemId, translation)
    })

    const itemsToTranslate: TranslationRequestItem[] = []
    const translationMetadata = new Map<
      string,
      { sourceHash: string; updatedAt: Date }
    >()

    sanitizedItems.forEach((item) => {
      const parsedUpdatedAt = item.updatedAt
        ? new Date(item.updatedAt)
        : new Date()
      const sourceHash = buildSourceFingerprint(item)
      const cached = translationById.get(item.id)
      if (
        cached &&
        cached.sourceHash === sourceHash &&
        cached.sourceUpdatedAt >= parsedUpdatedAt
      ) {
        return
      }
      translationMetadata.set(item.id, {
        sourceHash,
        updatedAt: parsedUpdatedAt,
      })
      itemsToTranslate.push(item)
    })

    if (itemsToTranslate.length > 0) {
      for (let i = 0; i < itemsToTranslate.length; i += CHUNK_SIZE) {
        const chunk = itemsToTranslate.slice(i, i + CHUNK_SIZE)
        let translatedChunk: TranslatedItemPayload[] = []
        try {
          translatedChunk = await translateChunk(
            languageValue,
            languageLabel,
            chunk
          )
        } catch (error: any) {
          if (error?.status === 429) {
            const retryDelay =
              error?.retryDelay ?? 15000
            return NextResponse.json(
              {
                error: 'Rate limit exceeded',
                details: 'Too many requests to the translation service',
                retryDelay,
              },
              {
                status: 429,
                headers: {
                  'Retry-After': String(Math.ceil(retryDelay / 1000)),
                },
              }
            )
          }
          console.error(
            `[translate-items] chunk translation failed`,
            error
          )
          throw error
        }

        const chunkById = new Map(chunk.map((item) => [item.id, item]))

        await Promise.all(
          chunk.map(async (item) => {
            const match = translatedChunk.find(
              (translated) => translated.id === item.id
            )

            const payload: TranslatedItemPayload = match
              ? match
              : {
                  id: item.id,
                  name: item.name,
                  description: item.description || '',
                  aiDescription: item.description || '',
                }

            const metadata = translationMetadata.get(item.id)
            const result = await prisma.menuItemTranslation.upsert({
              where: {
                menuItemId_language: {
                  menuItemId: item.id,
                  language: languageEnum,
                },
              },
              update: {
                translatedName: payload.name,
                translatedDescription: payload.description,
                aiDescription: payload.aiDescription,
                protein:
                  typeof payload.protein === 'number'
                    ? payload.protein
                    : null,
                carbs:
                  typeof payload.carbs === 'number'
                    ? payload.carbs
                    : null,
                sourceHash: metadata?.sourceHash ?? buildSourceFingerprint(item),
                sourceUpdatedAt: metadata?.updatedAt ?? new Date(),
              },
              create: {
                menuItemId: item.id,
                language: languageEnum,
                translatedName: payload.name,
                translatedDescription: payload.description,
                aiDescription: payload.aiDescription,
                protein:
                  typeof payload.protein === 'number'
                    ? payload.protein
                    : null,
                carbs:
                  typeof payload.carbs === 'number'
                    ? payload.carbs
                    : null,
                sourceHash: metadata?.sourceHash ?? buildSourceFingerprint(item),
                sourceUpdatedAt: metadata?.updatedAt ?? new Date(),
              },
            })

            translationById.set(item.id, result)
          })
        )
      }
    }

    const finalItems = sanitizedItems.map((item) => {
      const cached = translationById.get(item.id)
      if (cached) {
        return {
          id: item.id,
          name: cached.translatedName,
          description: cached.translatedDescription,
          aiDescription: cached.aiDescription,
          protein: cached.protein,
          carbs: cached.carbs,
        }
      }
      return {
        id: item.id,
        name: item.name,
        description: item.description || '',
        aiDescription: item.description || '',
        protein: item.protein ?? null,
        carbs: item.carbs ?? null,
      }
    })

    console.log(
      `[translate-items] language=${languageValue} translated ${itemsToTranslate.length}/${sanitizedItems.length}`
    )

    return NextResponse.json({
      language: languageLabel,
      items: finalItems,
    })
  } catch (error: any) {
    console.error('Error translating menu items:', error)
    if (error?.status === 429) {
      const retryDelay = error?.retryDelay ?? 15000
      return NextResponse.json(
        {
          error: 'Too many translation requests',
          details: error?.message,
          retryDelay,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(retryDelay / 1000)),
          },
        }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to translate menu items',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
