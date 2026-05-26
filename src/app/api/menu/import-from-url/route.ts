import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/platform-config'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { sanitizeErrorForClient } from '@/lib/sanitize-error'

const MAX_TEXT_LENGTH = 80_000
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function isForbiddenUrlFetch(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /403|Forbidden/i.test(message)
}

function isAiModelUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined
  return status === 503 || /503|Service Unavailable|high demand|try again later|overloaded/i.test(message)
}

function stripHtmlToText(html: string): string {
  const withoutScriptStyle = html.replace(
    /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,
    ''
  )
  const text = withoutScriptStyle
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text
}

async function fetchWithTavily(url: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY not set')

  const res = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      urls: [url],
      extract_depth: 'advanced',
      format: 'text',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Tavily extract failed: ${res.status} ${err}`)
  }

  const data = (await res.json()) as {
    results?: Array<{ raw_content?: string }>
    failed_results?: unknown[]
  }

  if (data.failed_results?.length) {
    throw new Error('Tavily could not extract this URL')
  }

  const raw = data.results?.[0]?.raw_content
  if (!raw || typeof raw !== 'string') {
    throw new Error('No content extracted from URL')
  }

  const text = raw.length > MAX_TEXT_LENGTH ? raw.slice(0, MAX_TEXT_LENGTH) : raw
  return text
}

async function fetchWithNode(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`)
  }

  const html = await res.text()
  return stripHtmlToText(html)
}

const EXTRACT_JSON_SCHEMA = `
Return ONLY a valid JSON array of menu items. No markdown, no extra text.
[
  {
    "name": "Dish name",
    "description": "Short description",
    "price": 0,
    "categoryName": "e.g. Main Course, Appetizer, Dessert, Drinks",
    "calories": 0,
    "protein": 0,
    "carbs": 0,
    "tags": ["halal", "spicy"],
    "prepTime": "15 minutes",
    "cookTime": "20 minutes",
    "recipeYield": 1,
    "ingredients": [
      { "name": "Ingredient name", "quantity": 100, "unit": "g", "pieceCount": null }
    ],
    "recipeSteps": ["Step 1", "Step 2"],
    "recipeTips": ["Chef tip"]
  }
]
RULES:
- Extract ALL menu items (dishes, drinks, sides, desserts) from the page.
- price: use numbers only; if currency is not IQD, convert to IQD (e.g. 1 USD ≈ 1310 IQD).
- categoryName: one short label per item (Main Course, Appetizer, Dessert, Drinks, Sides, etc.).
- If price or description is missing, estimate reasonably.
- calories, protein, carbs: estimate one-portion values when not shown.
- Generate practical recipe form data for each food item: prepTime, cookTime, recipeYield, ingredients, recipeSteps, recipeTips.
- For drinks or packaged/simple items, keep ingredients and steps short but still usable.
- tags: dietary/style tags like vegetarian, vegan, spicy, halal, gluten-free when evident.
`

type GeminiGenerateResponse = {
  text?: string
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

function isUrlContextFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /URL Context|url context|Gemini.*URL|retrieval failed|no menu items for this URL/i.test(message)
}

function getGeminiResponseText(response: GeminiGenerateResponse): string {
  const direct = response.text?.trim()
  if (direct) return direct

  const parts = response.candidates?.[0]?.content?.parts ?? []
  return parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n')
    .trim()
}

function readUrlContextMetadata(response: {
  candidates?: Array<Record<string, unknown>>
}) {
  const candidate = response.candidates?.[0]
  if (!candidate) return []

  const metadata =
    (candidate.urlContextMetadata as { urlMetadata?: unknown[]; url_metadata?: unknown[] } | undefined) ??
    (candidate.url_context_metadata as { urlMetadata?: unknown[]; url_metadata?: unknown[] } | undefined)

  const list = metadata?.urlMetadata ?? metadata?.url_metadata ?? []
  return Array.isArray(list) ? list : []
}

function getUrlContextRetrievalSummary(response: {
  candidates?: Array<Record<string, unknown>>
}): { ok: boolean; message: string } {
  const urlMetadata = readUrlContextMetadata(response)
  if (urlMetadata.length === 0) {
    // Metadata is not always present even when retrieval succeeds.
    return { ok: true, message: '' }
  }

  const successes = urlMetadata.filter((entry) => {
    const record = entry as { urlRetrievalStatus?: string; url_retrieval_status?: string }
    const status = record.urlRetrievalStatus ?? record.url_retrieval_status ?? ''
    return status === 'URL_RETRIEVAL_STATUS_SUCCESS'
  })
  if (successes.length === 0) {
    const statuses = urlMetadata
      .map((entry) => {
        const record = entry as { urlRetrievalStatus?: string; url_retrieval_status?: string }
        return record.urlRetrievalStatus ?? record.url_retrieval_status ?? 'UNKNOWN'
      })
      .join(', ')
    return {
      ok: false,
      message: `Gemini URL Context could not access this menu URL (${statuses}).`,
    }
  }

  return { ok: true, message: '' }
}

async function extractWithGeminiUrlContext(url: string, categoryNames: string[]): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('Google AI API key not configured')

  const ai = new GoogleGenAI({ apiKey })
  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (map to closest when possible): ${categoryNames.join(', ')}.`
      : ''

  const prompt = `You are extracting a restaurant menu from a public URL.

${categoryHint}

Use Gemini URL Context to read this exact URL:
${url}

Extract every menu item from the page. Include full menu-item form data: item name, short description, price in IQD, categoryName, nutrition, tags, prep/cook time, recipe yield, ingredients, recipe steps, and chef tips.
${EXTRACT_JSON_SCHEMA}
`

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [prompt],
    config: {
      tools: [{ urlContext: {} }],
    },
  })

  const retrieval = getUrlContextRetrievalSummary(response)
  const rawText = getGeminiResponseText(response)

  if (!rawText) {
    throw new Error(
      retrieval.ok
        ? 'Gemini URL Context returned an empty response for this menu URL.'
        : retrieval.message
    )
  }

  const items = parseExtractedItems(rawText)
  if (items.length === 0) {
    throw new Error(
      retrieval.ok
        ? 'Gemini URL Context read the page but returned no menu items. The link may not be a public menu page.'
        : retrieval.message
    )
  }

  return items
}

async function extractWithGemini(pageText: string, categoryNames: string[]): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('Google AI API key not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (map to closest when possible): ${categoryNames.join(', ')}.`
      : ''

  const prompt = `You are extracting a restaurant menu from web page content below.

${categoryHint}

Extract every menu item with full menu-item form data (name, description, price in IQD, categoryName, calories, protein, carbs, tags, prep/cook time, recipe yield, ingredients, recipe steps, chef tips).
${EXTRACT_JSON_SCHEMA}

Page content:
"""
${pageText}
"""
`

  const result = await model.generateContent(prompt)
  const raw = result.response.text()
  return parseExtractedItems(raw)
}

async function extractWithOpenAI(pageText: string, categoryNames: string[]): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.openaiApiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const openai = new OpenAI({ apiKey })
  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (map to closest): ${categoryNames.join(', ')}.`
      : ''

  const prompt = `Extract all restaurant menu items from this web page content. ${categoryHint}
${EXTRACT_JSON_SCHEMA}

Page content:
"""
${pageText}
"""
`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new Error('Empty response from OpenAI')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    return parseExtractedItems(raw)
  }
  if (Array.isArray(parsed)) {
    return normalizeExtractedItems(parsed)
  }
  if (parsed && typeof parsed === 'object' && 'items' in parsed && Array.isArray((parsed as any).items)) {
    return normalizeExtractedItems((parsed as any).items)
  }
  return parseExtractedItems(raw)
}

interface ExtractedItem {
  name: string
  description: string
  price: number
  categoryName: string
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  tags: string[]
  prepTime?: string | null
  cookTime?: string | null
  recipeYield?: number | null
  ingredients?: Array<{
    name: string
    quantity: number
    unit: string
    pieceCount?: number | null
  }>
  recipeSteps?: string[]
  recipeTips?: string[]
}

function parseExtractedItems(raw: string): ExtractedItem[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  let jsonText = trimmed.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim()
  const arrayMatch = jsonText.match(/\[[\s\S]*\]/)
  if (arrayMatch) jsonText = arrayMatch[0]

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText)
      if (Array.isArray(parsed)) return normalizeExtractedItems(parsed)
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown[] }).items)) {
        return normalizeExtractedItems((parsed as { items: unknown[] }).items)
      }
    } catch {
      // Fall through to object scan below.
    }
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0])
      if (Array.isArray(parsed)) return normalizeExtractedItems(parsed)
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown[] }).items)) {
        return normalizeExtractedItems((parsed as { items: unknown[] }).items)
      }
    } catch {
      return []
    }
  }

  return []
}

function normalizeExtractedItems(arr: any[]): ExtractedItem[] {
  return arr
    .map((item: any) => ({
      name: typeof item.name === 'string' ? item.name.trim() : 'Unnamed Item',
      description: typeof item.description === 'string' ? item.description : '',
      price: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 2000,
      categoryName: typeof item.categoryName === 'string' ? item.categoryName : 'Main Course',
      calories: typeof item.calories === 'number' ? item.calories : null,
      protein: typeof item.protein === 'number' ? item.protein : null,
      carbs: typeof item.carbs === 'number' ? item.carbs : null,
      tags: Array.isArray(item.tags) ? item.tags.filter((t: any) => typeof t === 'string') : [],
      prepTime: typeof item.prepTime === 'string' ? item.prepTime : null,
      cookTime: typeof item.cookTime === 'string' ? item.cookTime : null,
      recipeYield: typeof item.recipeYield === 'number' ? item.recipeYield : null,
      ingredients: Array.isArray(item.ingredients)
        ? item.ingredients
            .map((ingredient: any) => ({
              name: typeof ingredient.name === 'string' ? ingredient.name.trim() : '',
              quantity: typeof ingredient.quantity === 'number' ? ingredient.quantity : parseFloat(ingredient.quantity) || 0,
              unit: typeof ingredient.unit === 'string' ? ingredient.unit : 'g',
              pieceCount: typeof ingredient.pieceCount === 'number' ? ingredient.pieceCount : null,
            }))
            .filter((ingredient: any) => ingredient.name)
        : [],
      recipeSteps: Array.isArray(item.recipeSteps) ? item.recipeSteps.filter((step: any) => typeof step === 'string' && step.trim()) : [],
      recipeTips: Array.isArray(item.recipeTips) ? item.recipeTips.filter((tip: any) => typeof tip === 'string' && tip.trim()) : [],
    }))
    .filter((item) => item.name && item.name !== 'Unnamed Item')
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const url = typeof body.url === 'string' ? body.url.trim() : ''
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Basic URL validation
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const categoryNames = Array.isArray(body.categoryNames)
      ? body.categoryNames.filter((c: unknown): c is string => typeof c === 'string')
      : []

    let pageText: string | null = null
    let fetchError: unknown = null
    if (process.env.TAVILY_API_KEY) {
      try {
        pageText = await fetchWithTavily(url)
      } catch (error) {
        fetchError = error
        // Fallback to direct fetch when Tavily fails (e.g. URL not extractable, timeout)
        try {
          pageText = await fetchWithNode(url)
        } catch (nodeError) {
          fetchError = nodeError
        }
      }
    } else {
      try {
        pageText = await fetchWithNode(url)
      } catch (error) {
        fetchError = error
      }
    }

    const config = await getPlatformConfig()
    const hasGemini = !!(config.geminiApiKey || process.env.GOOGLE_AI_KEY)
    const hasOpenAI = !!(config.openaiApiKey || process.env.OPENAI_API_KEY)
    if (!hasGemini && !hasOpenAI) {
      return NextResponse.json(
        { error: 'No AI API key configured' },
        { status: 500 }
      )
    }

    let items: ExtractedItem[]
    let source: 'page-text' | 'url-context' = 'page-text'
    if (pageText && pageText.length >= 50) {
      if (hasGemini) {
        try {
          items = await extractWithGemini(pageText, categoryNames)
        } catch (err) {
          if (hasOpenAI) {
            items = await extractWithOpenAI(pageText, categoryNames)
          } else {
            throw err
          }
        }
      } else {
        items = await extractWithOpenAI(pageText, categoryNames)
      }
    } else if (hasGemini) {
      source = 'url-context'
      items = await extractWithGeminiUrlContext(url, categoryNames)
    } else if (fetchError) {
      throw fetchError
    } else {
      return NextResponse.json(
        { error: 'Could not extract enough text from this URL. Try a direct menu page.' },
        { status: 400 }
      )
    }

    if (items.length === 0 && hasGemini && source === 'page-text') {
      try {
        items = await extractWithGeminiUrlContext(url, categoryNames)
        source = 'url-context'
      } catch (urlContextError) {
        console.warn('Gemini URL Context fallback failed:', urlContextError)
      }
    }

    if (items.length === 0) {
      const blockedMessage =
        source === 'url-context' && fetchError && isForbiddenUrlFetch(fetchError)
          ? 'This menu website blocked server access, and Gemini URL Context could not extract menu items. Try uploading menu screenshots instead.'
          : source === 'url-context'
            ? 'Gemini URL Context could not extract menu items from this link. The page may be private, bot-protected, or not a public menu. Try uploading menu screenshots instead.'
            : fetchError && isForbiddenUrlFetch(fetchError)
              ? 'This menu website blocked server access, and Gemini URL Context could not extract menu items. Try uploading menu screenshots instead.'
              : 'No menu items found on this page. Make sure the URL is a public menu or food list.'
      return NextResponse.json(
        { error: blockedMessage },
        { status: 400 }
      )
    }

    // Map to same shape as extract-from-image (categoryId filled by frontend)
    const processedItems = items.map((item) => ({
      name: item.name,
      description: item.description,
      price: item.price,
      calories: item.calories ?? null,
      protein: item.protein ?? null,
      carbs: item.carbs ?? null,
      tags: item.tags,
      categoryName: item.categoryName,
      prepTime: item.prepTime ?? null,
      cookTime: item.cookTime ?? null,
      recipeYield: item.recipeYield ?? null,
      ingredients: item.ingredients || [],
      recipeSteps: item.recipeSteps || [],
      recipeTips: item.recipeTips || [],
      verified: false,
    }))

    return NextResponse.json({
      success: true,
      items: processedItems,
      source,
    })
  } catch (error) {
    console.error('Import from URL error:', error)
    if (isForbiddenUrlFetch(error) || isUrlContextFailure(error)) {
      return NextResponse.json(
        {
          error:
            error instanceof Error && error.message
              ? error.message
              : 'This menu website blocked server access. Try uploading menu screenshots instead.',
        },
        { status: 403 }
      )
    }

    if (isAiModelUnavailable(error)) {
      return NextResponse.json(
        { error: 'AI model is not available, Please Try Again Later' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to import menu from URL',
        details: sanitizeErrorForClient(error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 500 }
    )
  }
}
