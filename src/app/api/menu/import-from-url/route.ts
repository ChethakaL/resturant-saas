import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/platform-config'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { sanitizeErrorForClient } from '@/lib/sanitize-error'
import {
  fetchMenuPageText,
  isJsRenderedMenuSite,
  MIN_MENU_PAGE_TEXT_LENGTH,
} from '@/lib/menu-url-fetch'
import { extractMenuTextWithClaudeWebSearch, isClaudeModelNotFound } from '@/lib/menu-url-claude-search'

const MAX_TEXT_LENGTH = 80_000
const AI_RETRY_DELAYS_MS = [2000, 5000, 10000]
const URL_CONTEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'] as const

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function withAiRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= AI_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isAiModelUnavailable(error) || attempt >= AI_RETRY_DELAYS_MS.length) {
        throw error
      }
      console.warn(`${label}: AI busy (attempt ${attempt + 1}), retrying...`)
      await sleep(AI_RETRY_DELAYS_MS[attempt])
    }
  }
  throw lastError
}

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
  return /URL Context|url context|could not access this menu URL|retrieval failed|no menu items|returned no menu items/i.test(
    message
  )
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
      message: `AI could not access this menu URL (${statuses}). Try uploading menu screenshots instead.`,
    }
  }

  return { ok: true, message: '' }
}

async function extractWithGeminiUrlContextOnce(
  url: string,
  categoryNames: string[],
  model: (typeof URL_CONTEXT_MODELS)[number],
  options?: { simplified?: boolean }
): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('Google AI API key not configured')

  const ai = new GoogleGenAI({ apiKey })
  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (map to closest when possible): ${categoryNames.join(', ')}.`
      : ''

  const simplifiedRules = options?.simplified
    ? `
This is likely a JavaScript digital menu (e.g. mynu.app). Browse ALL category tabs/sections on the page.
Extract EVERY dish/drink with name, price, and categoryName. Prices are usually IQD — keep the number shown on the page.
Return ONLY a JSON array. Each item must include at minimum: name, description (short or empty string), price, categoryName.
You may omit ingredients/recipeSteps for this pass if needed to fit all items, but include them when easy.
Do not return prose, markdown, or an empty array if items are visible on the menu.
`
    : ''

  const prompt = `You are extracting a restaurant menu from a public URL.

${categoryHint}
${simplifiedRules}

Use URL Context to read this exact URL:
${url}

Extract every menu item from the page. Include full menu-item form data: item name, short description, price in IQD, categoryName, nutrition, tags, prep/cook time, recipe yield, ingredients, recipe steps, and chef tips.
${EXTRACT_JSON_SCHEMA}
`

  const response = await ai.models.generateContent({
    model,
    contents: [prompt],
    config: {
      tools: [{ urlContext: {} }],
      maxOutputTokens: 16384,
    },
  })

  const retrieval = getUrlContextRetrievalSummary(response)
  const rawText = getGeminiResponseText(response)

  if (!rawText) {
    throw new Error(
      retrieval.ok
        ? 'AI returned an empty response for this menu URL.'
        : retrieval.message
    )
  }

  let items = parseExtractedItems(rawText)
  if (items.length === 0) {
    items = await reparseMenuItemsFromRawText(rawText, categoryNames)
  }

  if (items.length === 0) {
    console.warn(
      'URL context returned no parseable menu items',
      JSON.stringify({ url, model, simplified: !!options?.simplified, rawPreview: rawText.slice(0, 400) })
    )
    throw new Error(
      retrieval.ok
        ? 'AI read the page but returned no menu items. The link may not be a public menu page.'
        : retrieval.message
    )
  }

  return items
}

async function reparseMenuItemsFromRawText(
  rawText: string,
  categoryNames: string[]
): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) return []

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 16384, temperature: 0 },
  })

  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (map to closest when possible): ${categoryNames.join(', ')}.`
      : ''

  const prompt = `Convert the following AI output into a valid JSON array of restaurant menu items.
${categoryHint}
${EXTRACT_JSON_SCHEMA}

AI output to convert:
"""
${rawText.slice(0, MAX_TEXT_LENGTH)}
"""
`

  try {
    const result = await model.generateContent(prompt)
    return parseExtractedItems(result.response.text())
  } catch {
    return []
  }
}

async function extractWithGeminiUrlContext(url: string, categoryNames: string[]): Promise<ExtractedItem[]> {
  let lastError: unknown
  const attempts: Array<{ model: (typeof URL_CONTEXT_MODELS)[number]; simplified: boolean }> = [
    { model: URL_CONTEXT_MODELS[0], simplified: false },
    { model: URL_CONTEXT_MODELS[0], simplified: true },
    { model: URL_CONTEXT_MODELS[1], simplified: true },
  ]

  for (const { model, simplified } of attempts) {
    try {
      return await withAiRetry(`Import URL context (${model}${simplified ? ', simplified' : ''})`, () =>
        extractWithGeminiUrlContextOnce(url, categoryNames, model, { simplified })
      )
    } catch (error) {
      lastError = error
      if (isAiModelUnavailable(error)) {
        console.warn(`Import URL context (${model}) unavailable, trying next option...`)
        continue
      }
      if (/returned no menu items/i.test(error instanceof Error ? error.message : '')) {
        console.warn(`Import URL context (${model}) found no items, trying next option...`)
        continue
      }
      throw error
    }
  }
  throw lastError
}

async function extractWithClaudeWebSearch(url: string, categoryNames: string[]): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured')

  try {
    const rawText = await extractMenuTextWithClaudeWebSearch(url, {
      apiKey,
      categoryNames,
      extractJsonSchema: EXTRACT_JSON_SCHEMA,
    })

    let items = parseExtractedItems(rawText)
    if (items.length === 0) {
      items = await reparseMenuItemsFromRawText(rawText, categoryNames)
    }
    if (items.length === 0) {
      throw new Error('AI web search read the page but returned no menu items.')
    }
    return items
  } catch (error) {
    if (isClaudeModelNotFound(error)) {
      throw Object.assign(new Error('Claude web search model unavailable'), {
        code: 'CLAUDE_MODEL_UNAVAILABLE',
        cause: error,
      })
    }
    throw error
  }
}

async function tryClaudeWebSearchOrThrow(
  url: string,
  categoryNames: string[],
  hasGemini: boolean
): Promise<{ items: ExtractedItem[]; source: 'claude-web-search' | 'url-context' }> {
  try {
    const items = await extractWithClaudeWebSearch(url, categoryNames)
    return { items, source: 'claude-web-search' }
  } catch (claudeError) {
    const skipToGemini =
      hasGemini &&
      (isClaudeModelNotFound(claudeError) ||
        (claudeError instanceof Error &&
          (claudeError as Error & { code?: string }).code === 'CLAUDE_MODEL_UNAVAILABLE') ||
        /web search read the page but returned no menu items/i.test(
          claudeError instanceof Error ? claudeError.message : ''
        ))

    if (skipToGemini) {
      console.warn(
        '[import-from-url] Claude web search unavailable or empty, falling back to URL context:',
        claudeError instanceof Error ? claudeError.message : claudeError
      )
      const items = await extractWithGeminiUrlContext(url, categoryNames)
      return { items, source: 'url-context' }
    }
    throw claudeError
  }
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

  const result = await withAiRetry('Import page text', () => model.generateContent(prompt))
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
  let menuUrl = ''
  let tavilyApiKey: string | undefined
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    menuUrl = typeof body.url === 'string' ? body.url.trim() : ''
    if (!menuUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Basic URL validation
    try {
      new URL(menuUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const categoryNames = Array.isArray(body.categoryNames)
      ? body.categoryNames.filter((c: unknown): c is string => typeof c === 'string')
      : []

    const config = await getPlatformConfig()
    tavilyApiKey = config.tavilyApiKey
    const { pageText, fetchError, fetchMethod } = await fetchMenuPageText(menuUrl, tavilyApiKey)
    if (fetchMethod) {
      console.log(`[import-from-url] Page content via ${fetchMethod} (${pageText?.length ?? 0} chars)`)
    }

    const hasGemini = !!(config.geminiApiKey || process.env.GOOGLE_AI_KEY)
    const hasOpenAI = !!(config.openaiApiKey || process.env.OPENAI_API_KEY)
    const hasAnthropic = !!(config.anthropicApiKey || process.env.ANTHROPIC_API_KEY)
    if (!hasGemini && !hasOpenAI && !hasAnthropic) {
      return NextResponse.json(
        { error: 'No AI API key configured' },
        { status: 500 }
      )
    }

    let items: ExtractedItem[]
    let source: 'page-text' | 'claude-web-search' | 'url-context' = 'page-text'
    if (pageText && pageText.length >= MIN_MENU_PAGE_TEXT_LENGTH) {
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
    } else if (hasAnthropic) {
      const result = await tryClaudeWebSearchOrThrow(menuUrl, categoryNames, hasGemini)
      items = result.items
      source = result.source
    } else if (hasGemini) {
      source = 'url-context'
      items = await extractWithGeminiUrlContext(menuUrl, categoryNames)
    } else if (fetchError) {
      throw fetchError
    } else {
      return NextResponse.json(
        { error: 'Could not extract enough text from this URL. Try a direct menu page.' },
        { status: 400 }
      )
    }

    if (items.length === 0 && hasAnthropic && source === 'page-text') {
      try {
        const result = await tryClaudeWebSearchOrThrow(menuUrl, categoryNames, hasGemini)
        items = result.items
        source = result.source
      } catch (claudeSearchError) {
        console.warn('Claude web search fallback failed:', claudeSearchError)
      }
    }

    if (items.length === 0 && hasGemini && source === 'page-text') {
      try {
        items = await extractWithGeminiUrlContext(menuUrl, categoryNames)
        source = 'url-context'
      } catch (urlContextError) {
        console.warn('Gemini URL Context fallback failed:', urlContextError)
      }
    }

    if (items.length === 0) {
      const jsMenuSite = isJsRenderedMenuSite(menuUrl)
      const blockedMessage =
        jsMenuSite && !tavilyApiKey && !hasAnthropic
          ? 'This digital menu loads with JavaScript (e.g. mynu.app). Configure advanced link extraction or AI web search, or upload menu screenshots instead.'
          : source === 'url-context' && jsMenuSite && !tavilyApiKey
            ? 'This digital menu loads with JavaScript (e.g. mynu.app). Our server could not read the full menu from the link. Try again after enabling advanced link extraction, or upload menu screenshots instead.'
            : source === 'claude-web-search' || source === 'url-context'
              ? fetchError && isForbiddenUrlFetch(fetchError)
                ? 'This menu website blocked server access, and AI could not extract menu items from the link. Try uploading menu screenshots instead.'
                : 'AI could not extract menu items from this link. The page may be private, bot-protected, or a JavaScript-only menu. Try uploading menu screenshots instead.'
              : fetchError && isForbiddenUrlFetch(fetchError)
                ? 'This menu website blocked server access, and AI could not extract menu items from the link. Try uploading menu screenshots instead.'
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
      const jsMenuSite = isJsRenderedMenuSite(menuUrl)
      const friendlyMessage =
        jsMenuSite && !tavilyApiKey
          ? 'This digital menu loads with JavaScript (e.g. mynu.app). Our server could not read the full menu from the link. Try uploading menu screenshots instead.'
          : error instanceof Error && error.message
            ? error.message.replace(/Gemini URL Context/gi, 'AI')
            : 'This menu website blocked server access. Try uploading menu screenshots instead.'

      return NextResponse.json({ error: friendlyMessage }, { status: 403 })
    }

    if (isAiModelUnavailable(error)) {
      return NextResponse.json(
        {
          error: 'AI is busy right now',
          details:
            "We're experiencing high AI usage. Please wait at least one minute before trying your menu link again — retrying immediately may fail again.",
          code: 'AI_OVERLOADED',
        },
        { status: 503 }
      )
    }

    if (isClaudeModelNotFound(error)) {
      return NextResponse.json(
        {
          error: 'AI web search is temporarily unavailable',
          details:
            'Menu link import could not use web search right now. Please try again in a minute, or upload menu screenshots instead.',
          code: 'AI_WEB_SEARCH_UNAVAILABLE',
        },
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
