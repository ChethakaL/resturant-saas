import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import { sanitizeErrorForClient } from '@/lib/sanitize-error'

const MAX_TEXT_LENGTH = 80_000
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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
    "tags": ["halal", "spicy"]
  }
]
RULES:
- Extract ALL menu items (dishes, drinks, sides, desserts) from the page.
- price: use numbers only; if currency is not IQD, convert to IQD (e.g. 1 USD ≈ 1310 IQD).
- categoryName: one short label per item (Main Course, Appetizer, Dessert, Drinks, Sides, etc.).
- If price or description is missing, estimate reasonably.
- tags: dietary/style tags like vegetarian, vegan, spicy, halal, gluten-free when evident.
`

async function extractWithGemini(pageText: string, categoryNames: string[]): Promise<ExtractedItem[]> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('Google AI API key not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (map to closest when possible): ${categoryNames.join(', ')}.`
      : ''

  const prompt = `You are extracting a restaurant menu from web page content below.

${categoryHint}

Extract every menu item (name, description, price in IQD, categoryName, calories if visible, tags).
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
  const apiKey = process.env.OPENAI_API_KEY
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
  tags: string[]
}

function parseExtractedItems(raw: string): ExtractedItem[] {
  let jsonText = raw.trim()
  jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
  const arrayMatch = jsonText.match(/\[[\s\S]*\]/)
  if (arrayMatch) jsonText = arrayMatch[0]
  const arr = JSON.parse(jsonText)
  return normalizeExtractedItems(Array.isArray(arr) ? arr : [])
}

function normalizeExtractedItems(arr: any[]): ExtractedItem[] {
  return arr
    .map((item: any) => ({
      name: typeof item.name === 'string' ? item.name.trim() : 'Unnamed Item',
      description: typeof item.description === 'string' ? item.description : '',
      price: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 2000,
      categoryName: typeof item.categoryName === 'string' ? item.categoryName : 'Main Course',
      calories: typeof item.calories === 'number' ? item.calories : null,
      tags: Array.isArray(item.tags) ? item.tags.filter((t: any) => typeof t === 'string') : [],
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

    let pageText: string
    if (process.env.TAVILY_API_KEY) {
      try {
        pageText = await fetchWithTavily(url)
      } catch {
        // Fallback to direct fetch when Tavily fails (e.g. URL not extractable, timeout)
        pageText = await fetchWithNode(url)
      }
    } else {
      pageText = await fetchWithNode(url)
    }

    if (!pageText || pageText.length < 50) {
      return NextResponse.json(
        { error: 'Could not extract enough text from this URL. Try a direct menu page.' },
        { status: 400 }
      )
    }

    const hasGemini = !!process.env.GOOGLE_AI_KEY
    const hasOpenAI = !!process.env.OPENAI_API_KEY
    if (!hasGemini && !hasOpenAI) {
      return NextResponse.json(
        { error: 'No AI API key configured' },
        { status: 500 }
      )
    }

    let items: ExtractedItem[]
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

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No menu items found on this page. Make sure the URL is a menu or food list.' },
        { status: 400 }
      )
    }

    // Map to same shape as extract-from-image (categoryId filled by frontend)
    const processedItems = items.map((item) => ({
      name: item.name,
      description: item.description,
      price: item.price,
      calories: item.calories ?? null,
      tags: item.tags,
      categoryName: item.categoryName,
      verified: false,
    }))

    return NextResponse.json({
      success: true,
      items: processedItems,
    })
  } catch (error) {
    console.error('Import from URL error:', error)
    return NextResponse.json(
      {
        error: 'Failed to import menu from URL',
        details: sanitizeErrorForClient(error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 500 }
    )
  }
}
