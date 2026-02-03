import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

type LanguageCode = 'en' | 'ar' | 'ku'

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  ar: 'Iraqi Arabic',
  ku: 'Sorani Kurdish',
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
      console.error('Failed to parse request body:', error)
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const { language, item } = body
    if (!language || !LANGUAGE_LABELS[language as LanguageCode]) {
      return NextResponse.json({ error: 'Invalid language selection' }, { status: 400 })
    }

    if (!item || !item.id) {
      return NextResponse.json({ error: 'Invalid item' }, { status: 400 })
    }

    if (language === 'en') {
      return NextResponse.json({
        language: 'English',
        item: {
          id: item.id,
          name: item.name,
          description: item.description || '',
          aiDescription: item.description || '',
          protein: item.protein ?? null,
          carbs: item.carbs ?? null,
        },
      })
    }

    const languageLabel = LANGUAGE_LABELS[language as LanguageCode]
    const description = item.description || 'No description provided'
    const category = item.category || 'Chef specials'

    const snippet = `- ID: ${item.id} | Name: ${item.name} | Category: ${category} | Description: ${description} | Price: ${item.price || 'unknown'} | Calories: ${item.calories ?? 'unknown'}`

    const prompt = `You are a bilingual Erbil Iraqi chef rewriting menu content for local diners in ${languageLabel}. Translate every text element below, keep all digits exactly as they already appear (do NOT convert them to Arabic-script numerals), and return the following EXACT JSON structure with no extra text:\n{\n  "id": "item-id",\n  "name": "localized name",\n  "description": "Concise ${languageLabel} description",\n  "aiDescription": "Two-sentence expressive story in ${languageLabel}",\n  "protein": 25,\n  "carbs": 40\n}\nKeep the original ID and include a localized name, a short description, an AI-crafted story, and integer protein/carbs estimates. Numbers should stay as ASCII digits. Here is the item to translate:\n${snippet}`

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
    // Use gemini-2.5-flash for text translation (stable, generateContent supported)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    })
    const aiResult = await model.generateContent(prompt)
    
    const rawText = aiResult.response.text()

    let jsonText = rawText.trim()
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    const match = jsonText.match(/\{[\s\S]*\}/)
    if (match) {
      jsonText = match[0]
    }

    let payload
    try {
      payload = JSON.parse(jsonText)
    } catch (error) {
      console.error('Failed to parse translation response:', jsonText)
      throw new Error('Failed to parse translation response')
    }

    if (!payload.id) {
      payload.id = item.id
    }

    const translatedItem = {
      id: payload.id,
      name: payload.name || item.name,
      description: payload.description || item.description || '',
      aiDescription: payload.aiDescription || payload.description || item.description || '',
      protein:
        typeof payload.protein === 'number'
          ? payload.protein
          : payload.protein
            ? Number(payload.protein)
            : item.protein ?? null,
      carbs:
        typeof payload.carbs === 'number'
          ? payload.carbs
          : payload.carbs
            ? Number(payload.carbs)
            : item.carbs ?? null,
    }

    return NextResponse.json({
      language: languageLabel,
      item: translatedItem,
    })
  } catch (error: any) {
    console.error('Error translating menu item:', error)
    
    // Handle rate limit errors (429) with retry delay
    if (error?.status === 429) {
      let retryDelay = 15000 // Default 15 seconds
      
      // Extract retry delay from error details if available
      if (error?.errorDetails) {
        const retryInfo = error.errorDetails.find(
          (detail: any) => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
        )
        if (retryInfo?.retryDelay) {
          // Parse delay (format: "14s" or similar)
          const delayMatch = retryInfo.retryDelay.match(/(\d+)/)
          if (delayMatch) {
            retryDelay = parseInt(delayMatch[1]) * 1000 // Convert to milliseconds
          }
        }
      }
      
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          details: 'Too many requests. Please try again later.',
          retryAfter: retryDelay / 1000, // Return in seconds
          retryDelay: retryDelay,
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
        error: 'Failed to translate menu item',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
