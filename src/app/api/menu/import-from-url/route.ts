import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/platform-config'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { sanitizeErrorForClient } from '@/lib/sanitize-error'
import {
  describeAiKeys,
  errorImportFromUrl,
  getTavilyKeyDiagnostics,
  logImportFromUrl,
  warnImportFromUrl,
} from '@/lib/import-from-url-log'
import {
  fetchMenuPageText,
  isJsRenderedMenuSite,
  MIN_MENU_PAGE_TEXT_LENGTH,
} from '@/lib/menu-url-fetch'
import { getRawPlatformConfig } from '@/lib/platform-config'
import {
  extractMenuTextWithClaudeFromPageText,
  extractMenuTextWithClaudeWebSearch,
  isClaudeModelNotFound,
} from '@/lib/menu-url-claude-search'

export const maxDuration = 300

const MAX_TEXT_LENGTH = 80_000
const GEMINI_INPUT_MAX = 45_000
const AI_RETRY_DELAYS_MS = [2000, 5000, 10000]
const AI_RETRY_FAST_MS = [1500]
const URL_CONTEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'] as const

export type ImportProgressFn = (phase: string, message: string) => void

const SIMPLIFIED_JSON_SCHEMA = `
Return ONLY a valid JSON array. No markdown. Extract ALL menu items from the page.
[
  {
    "name": "Dish name",
    "description": "Short description or empty string",
    "price": 0,
    "categoryName": "Breakfast"
  }
]
RULES:
- price: number only (IQD as shown on page).
- categoryName: section label (Breakfast, Soups, Main Courses, Drinks, etc.).
- Include every dish/drink with a price on the page.
- Do not include recipe, ingredients, or nutrition fields.
`

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function withAiRetryFast<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= AI_RETRY_FAST_MS.length; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isAiModelUnavailable(error) || attempt >= AI_RETRY_FAST_MS.length) {
        throw error
      }
      await sleep(AI_RETRY_FAST_MS[attempt])
    }
  }
  throw lastError
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

async function extractWithClaudeFromRawText(
  rawText: string,
  categoryNames: string[],
  sourceLabel: 'claude-page-text' | 'claude-web-search'
): Promise<ExtractedItem[]> {
  let items = parseExtractedItems(rawText)
  if (items.length === 0) {
    items = await reparseMenuItemsFromRawText(rawText, categoryNames)
  }
  items = items.filter((item) => item.name !== '__INACCESSIBLE__')
  if (items.length === 0) {
    throw new Error(`AI ${sourceLabel} returned no parseable menu items.`)
  }
  return items
}

async function extractWithClaudeFromPageText(
  pageText: string,
  categoryNames: string[]
): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured')

  const rawText = await extractMenuTextWithClaudeFromPageText(pageText, {
    apiKey,
    categoryNames,
    extractJsonSchema: EXTRACT_JSON_SCHEMA,
  })
  return extractWithClaudeFromRawText(rawText, categoryNames, 'claude-page-text')
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
    return extractWithClaudeFromRawText(rawText, categoryNames, 'claude-web-search')
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

async function tryClaudeMenuExtraction(
  url: string,
  categoryNames: string[],
  pageText: string | null,
  hasGemini: boolean
): Promise<{ items: ExtractedItem[]; source: 'claude-page-text' | 'claude-web-search' | 'url-context' }> {
  const jsMenu = isJsRenderedMenuSite(url)

  if (pageText && pageText.length >= MIN_MENU_PAGE_TEXT_LENGTH) {
    try {
      const items = await extractWithClaudeFromPageText(pageText, categoryNames)
      return { items, source: 'claude-page-text' }
    } catch (claudeParseError) {
      console.warn(
        '[import-from-url] Claude page-text parse failed, trying Gemini on same text:',
        claudeParseError instanceof Error ? claudeParseError.message : claudeParseError
      )
      if (hasGemini) {
        const items = await extractWithGemini(pageText, categoryNames)
        if (items.length > 0) return { items, source: 'claude-page-text' }
      }
    }
  }

  if (jsMenu) {
    console.warn(
      '[import-from-url] Skipping Claude web_search for JS menu host — web_search cannot render mynu-style menus.'
    )
    if (hasGemini) {
      const items = await extractWithGeminiUrlContext(url, categoryNames)
      return { items, source: 'url-context' }
    }
    throw new Error(
      'We could not read this digital menu from the link. Try uploading photos of your menu instead.'
    )
  }

  try {
    const items = await extractWithClaudeWebSearch(url, categoryNames)
    return { items, source: 'claude-web-search' }
  } catch (claudeError) {
    if (hasGemini) {
      console.warn(
        '[import-from-url] Claude web search failed, falling back to URL context:',
        claudeError instanceof Error ? claudeError.message : claudeError
      )
      const items = await extractWithGeminiUrlContext(url, categoryNames)
      return { items, source: 'url-context' }
    }
    throw claudeError
  }
}

function trimPageTextForModel(pageText: string): string {
  if (pageText.length <= GEMINI_INPUT_MAX) return pageText
  return pageText.slice(0, GEMINI_INPUT_MAX)
}

async function extractWithGeminiSimplified(
  pageText: string,
  categoryNames: string[]
): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('Google AI API key not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 8192, temperature: 0 },
  })

  const categoryHint =
    categoryNames.length > 0
      ? `Map to closest category when possible: ${categoryNames.join(', ')}.`
      : ''

  const prompt = `Extract every restaurant menu item from this page text.
${categoryHint}
${SIMPLIFIED_JSON_SCHEMA}

Page content:
"""
${trimPageTextForModel(pageText)}
"""
`

  const result = await withAiRetryFast('Import simplified Gemini', () => model.generateContent(prompt))
  const raw = result.response.text()?.trim() ?? ''
  if (!raw) {
    warnImportFromUrl('Simplified Gemini returned empty response', {
      finishReason: result.response.candidates?.[0]?.finishReason ?? 'unknown',
    })
    return []
  }
  const items = parseExtractedItems(raw)
  if (items.length === 0) {
    warnImportFromUrl('Simplified Gemini returned 0 parseable items', {
      rawChars: raw.length,
      rawPreview: raw.slice(0, 120).replace(/\s+/g, ' '),
    })
  }
  return items
}

async function extractWithOpenAISimplified(
  pageText: string,
  categoryNames: string[]
): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.openaiApiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const openai = new OpenAI({ apiKey })
  const categoryHint =
    categoryNames.length > 0 ? `Categories: ${categoryNames.join(', ')}.` : ''

  const completion = await withAiRetryFast('Import simplified OpenAI', () =>
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `Extract every menu item into JSON with one key "items" (array of dishes).\n${categoryHint}\n${SIMPLIFIED_JSON_SCHEMA}\n\nPage text:\n"""\n${trimPageTextForModel(pageText)}\n"""`,
        },
      ],
    })
  )

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''
  if (!raw) {
    warnImportFromUrl('Simplified OpenAI returned empty response', {})
    return []
  }
  const items = parseExtractedItems(raw)
  if (items.length === 0) {
    warnImportFromUrl('Simplified OpenAI returned 0 parseable items', {
      rawChars: raw.length,
      rawPreview: raw.slice(0, 120).replace(/\s+/g, ' '),
    })
  }
  return items
}

async function extractWithClaudeSimplified(
  pageText: string,
  categoryNames: string[]
): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured')

  const rawText = await extractMenuTextWithClaudeFromPageText(trimPageTextForModel(pageText), {
    apiKey,
    categoryNames,
    extractJsonSchema: SIMPLIFIED_JSON_SCHEMA,
  })
  const items = parseExtractedItems(rawText)
  if (items.length === 0) {
    warnImportFromUrl('Simplified Claude returned 0 parseable items', {
      rawChars: rawText.length,
      rawPreview: rawText.slice(0, 120).replace(/\s+/g, ' '),
    })
  }
  return items
}

type FastExtractProvider = 'openai' | 'gemini' | 'claude'

async function extractMenuFromPageTextFast(
  pageText: string,
  categoryNames: string[],
  options: { hasOpenAI: boolean; hasGemini: boolean; hasAnthropic: boolean }
): Promise<{ items: ExtractedItem[]; provider?: FastExtractProvider; sawOverload: boolean }> {
  const attempts: Array<{
    provider: FastExtractProvider
    enabled: boolean
    run: () => Promise<ExtractedItem[]>
  }> = [
    { provider: 'openai', enabled: options.hasOpenAI, run: () => extractWithOpenAISimplified(pageText, categoryNames) },
    { provider: 'gemini', enabled: options.hasGemini, run: () => extractWithGeminiSimplified(pageText, categoryNames) },
    { provider: 'claude', enabled: options.hasAnthropic, run: () => extractWithClaudeSimplified(pageText, categoryNames) },
  ]

  let sawOverload = false

  for (const attempt of attempts) {
    if (!attempt.enabled) {
      logImportFromUrl('Skipping simplified extraction (not configured)', { provider: attempt.provider })
      continue
    }

    logImportFromUrl('Trying simplified extraction', { provider: attempt.provider })

    try {
      const items = await attempt.run()
      if (items.length > 0) {
        logImportFromUrl('Simplified extraction succeeded', {
          provider: attempt.provider,
          itemCount: items.length,
        })
        return { items, provider: attempt.provider, sawOverload }
      }
      warnImportFromUrl('Simplified extraction returned 0 items', { provider: attempt.provider })
    } catch (err) {
      if (isAiModelUnavailable(err)) sawOverload = true
      warnImportFromUrl('Simplified extraction failed', {
        provider: attempt.provider,
        overloaded: isAiModelUnavailable(err),
        reason: err instanceof Error ? err.message.slice(0, 240) : String(err),
      })
    }
  }

  logImportFromUrl('All simplified extraction providers exhausted', { sawOverload })
  return { items: [], sawOverload }
}

async function extractWithGemini(pageText: string, categoryNames: string[]): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('Google AI API key not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 8192, temperature: 0 },
  })

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
${trimPageTextForModel(pageText)}
"""
`

  const result = await withAiRetryFast('Import page text', () => model.generateContent(prompt))
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

function itemHasFullForm(item: ExtractedItem) {
  return Boolean(
    item.description?.trim() &&
      item.prepTime &&
      item.cookTime &&
      (item.ingredients && item.ingredients.length > 0) &&
      (item.recipeSteps && item.recipeSteps.length > 0) &&
      item.calories &&
      item.protein != null &&
      item.carbs != null
  )
}

function buildFallbackFullForm(item: ExtractedItem): ExtractedItem {
  const text = `${item.name} ${item.categoryName} ${(item.tags || []).join(' ')}`.toLowerCase()
  const isDrink = /drink|juice|tea|coffee|latte|mocha|soda|cola|water|smoothie|shake|mocktail/.test(text)
  const isDessert = /dessert|cake|sweet|ice cream|baklava|kunafa|pudding|pastry|brownie/.test(text)
  const isSoup = /soup|broth|shorba|bisque/.test(text)
  const isSalad = /salad|fattoush|tabbouleh/.test(text)

  const description =
    item.description?.trim() ||
    (isDrink
      ? `Refreshing ${item.name.toLowerCase()} prepared to order.`
      : isDessert
        ? `${item.name} served as a sweet finish with balanced texture and flavor.`
        : `${item.name} prepared fresh with balanced seasoning and consistent restaurant presentation.`)

  const ingredients = item.ingredients?.length
    ? item.ingredients
    : isDrink
      ? [
          { name: item.name, quantity: 1, unit: 'portion', pieceCount: null },
          { name: 'Ice', quantity: 80, unit: 'g', pieceCount: null },
          { name: 'Garnish', quantity: 1, unit: 'piece', pieceCount: null },
        ]
      : isSoup
        ? [
            { name: 'Soup base', quantity: 250, unit: 'ml', pieceCount: null },
            { name: item.name.replace(/soup/i, '').trim() || 'Main ingredient', quantity: 120, unit: 'g', pieceCount: null },
            { name: 'Seasoning', quantity: 5, unit: 'g', pieceCount: null },
          ]
        : isSalad
          ? [
              { name: 'Fresh vegetables', quantity: 180, unit: 'g', pieceCount: null },
              { name: 'Dressing', quantity: 35, unit: 'ml', pieceCount: null },
              { name: 'Garnish', quantity: 15, unit: 'g', pieceCount: null },
            ]
          : isDessert
            ? [
                { name: item.name, quantity: 1, unit: 'portion', pieceCount: null },
                { name: 'Sauce or garnish', quantity: 20, unit: 'g', pieceCount: null },
              ]
            : [
                { name: item.name, quantity: 1, unit: 'portion', pieceCount: null },
                { name: 'Seasoning', quantity: 5, unit: 'g', pieceCount: null },
                { name: 'Garnish', quantity: 15, unit: 'g', pieceCount: null },
              ]

  const recipeSteps = item.recipeSteps?.length
    ? item.recipeSteps
    : isDrink
      ? [
          `Prepare the glass and required ingredients for ${item.name}.`,
          'Combine ingredients, chill or blend as appropriate.',
          'Garnish and serve immediately.',
        ]
      : [
          `Prepare ingredients for ${item.name} according to the recipe portion.`,
          'Cook or assemble the item using standard kitchen procedure and seasoning.',
          'Plate consistently, garnish, and send to service while fresh.',
        ]

  return {
    ...item,
    description,
    calories: item.calories ?? (isDrink ? 140 : isDessert ? 420 : isSalad ? 260 : 520),
    protein: item.protein ?? (isDrink ? 2 : isDessert ? 6 : isSalad ? 8 : 28),
    carbs: item.carbs ?? (isDrink ? 28 : isDessert ? 58 : isSalad ? 18 : 45),
    tags: item.tags?.length ? item.tags : [isDrink ? 'drink' : isDessert ? 'dessert' : 'popular'],
    prepTime: item.prepTime || (isDrink || isSalad ? '5 minutes' : '10 minutes'),
    cookTime: item.cookTime || (isDrink || isSalad ? '0 minutes' : isSoup ? '20 minutes' : '15 minutes'),
    recipeYield: item.recipeYield ?? 1,
    ingredients,
    recipeSteps,
    recipeTips: item.recipeTips?.length
      ? item.recipeTips
      : ['Keep portion size consistent.', 'Taste and adjust seasoning before service.'],
  }
}

function mergeEnrichedItem(base: ExtractedItem, enriched?: ExtractedItem): ExtractedItem {
  if (!enriched) return base
  return {
    ...base,
    description: enriched.description || base.description,
    calories: enriched.calories ?? base.calories ?? null,
    protein: enriched.protein ?? base.protein ?? null,
    carbs: enriched.carbs ?? base.carbs ?? null,
    tags: enriched.tags?.length ? enriched.tags : base.tags,
    prepTime: enriched.prepTime ?? base.prepTime ?? null,
    cookTime: enriched.cookTime ?? base.cookTime ?? null,
    recipeYield: enriched.recipeYield ?? base.recipeYield ?? 1,
    ingredients: enriched.ingredients?.length ? enriched.ingredients : base.ingredients || [],
    recipeSteps: enriched.recipeSteps?.length ? enriched.recipeSteps : base.recipeSteps || [],
    recipeTips: enriched.recipeTips?.length ? enriched.recipeTips : base.recipeTips || [],
  }
}

async function enrichWithGemini(batch: ExtractedItem[]): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('Google AI API key not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 16384, temperature: 0.2 },
  })

  const prompt = `You are Smart Chef. Fill full restaurant menu item forms for these imported items.
Return ONLY a JSON array with the same item order and same names.
For every item, generate:
- description
- calories, protein, carbs for one portion
- tags
- prepTime, cookTime, recipeYield
- ingredients with practical quantity and unit
- recipeSteps
- recipeTips

Use common restaurant knowledge when recipe data is not visible in the imported URL.
Keep drinks/simple add-ons short but still usable.

${EXTRACT_JSON_SCHEMA}

Items to enrich:
${JSON.stringify(batch.map((item) => ({
  name: item.name,
  description: item.description,
  price: item.price,
  categoryName: item.categoryName,
  tags: item.tags,
})))}
`

  const result = await withAiRetryFast('Import URL full-form enrichment', () => model.generateContent(prompt))
  return parseExtractedItems(result.response.text())
}

async function enrichWithOpenAI(batch: ExtractedItem[]): Promise<ExtractedItem[]> {
  const config = await getPlatformConfig()
  const apiKey = config.openaiApiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const openai = new OpenAI({ apiKey })
  const completion = await withAiRetryFast('Import URL OpenAI full-form enrichment', () =>
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 12000,
      messages: [
        {
          role: 'user',
          content: `Fill full restaurant menu item forms for these imported items. Return ONLY a JSON array with same order and same names.
Generate description, calories, protein, carbs, tags, prepTime, cookTime, recipeYield, ingredients, recipeSteps, recipeTips.
Use common restaurant knowledge when recipe data is not visible.

${EXTRACT_JSON_SCHEMA}

Items:
${JSON.stringify(batch.map((item) => ({
  name: item.name,
  description: item.description,
  price: item.price,
  categoryName: item.categoryName,
  tags: item.tags,
})))}`,
        },
      ],
    })
  )

  return parseExtractedItems(completion.choices[0]?.message?.content ?? '')
}

async function enrichMenuItemsFullForm(
  items: ExtractedItem[],
  options: { hasGemini: boolean; hasOpenAI: boolean; onProgress?: ImportProgressFn }
): Promise<ExtractedItem[]> {
  const missingIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !itemHasFullForm(item))

  if (missingIndexes.length === 0) return items
  if (!options.hasGemini && !options.hasOpenAI) return items

  const next = [...items]
  const batchSize = 20
  for (let start = 0; start < missingIndexes.length; start += batchSize) {
    const chunk = missingIndexes.slice(start, start + batchSize)
    options.onProgress?.(
      'enrich',
      `Filling recipes and nutrition ${Math.min(start + batchSize, missingIndexes.length)} of ${missingIndexes.length}…`
    )
    const batch = chunk.map(({ item }) => item)
    try {
      const enriched = options.hasGemini
        ? await enrichWithGemini(batch)
        : await enrichWithOpenAI(batch)
      chunk.forEach(({ index }, batchIndex) => {
        next[index] = mergeEnrichedItem(next[index], enriched[batchIndex])
      })
    } catch (error) {
      warnImportFromUrl('Full-form enrichment batch failed', {
        start,
        count: batch.length,
        reason: error instanceof Error ? error.message.slice(0, 240) : String(error),
      })
    }
  }

  return next.map((item) => (itemHasFullForm(item) ? item : buildFallbackFullForm(item)))
}

function mapProcessedItems(items: ExtractedItem[]) {
  return items.map((item) => ({
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
}

function importErrorResponse(
  error: unknown,
  menuUrl: string,
  tavilyApiKey: string | undefined
): { body: Record<string, unknown>; status: number } {
  if (isForbiddenUrlFetch(error) || isUrlContextFailure(error)) {
    const jsMenuSite = isJsRenderedMenuSite(menuUrl)
    const friendlyMessage =
      jsMenuSite && !tavilyApiKey
        ? 'We could not read this digital menu from the link. Try uploading photos of your menu instead.'
        : error instanceof Error && error.message
          ? sanitizeErrorForClient(error.message)
          : 'We could not open this menu link. Try uploading photos of your menu instead.'
    return { body: { error: friendlyMessage }, status: 403 }
  }

  const overloadCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : undefined
  if (isAiModelUnavailable(error) || overloadCode === 'AI_OVERLOADED') {
    return {
      body: {
        error: 'Import is busy right now',
        details:
          'Please wait at least one minute, then try your menu link again.',
        code: 'AI_OVERLOADED',
      },
      status: 503,
    }
  }

  if (isClaudeModelNotFound(error)) {
    return {
      body: {
        error: 'Import is temporarily unavailable',
        details:
          'Please try again in a minute, or upload photos of your menu instead.',
        code: 'AI_WEB_SEARCH_UNAVAILABLE',
      },
      status: 503,
    }
  }

  const message = error instanceof Error ? error.message : 'Unknown error'
  if (/could not parse|no menu items/i.test(message)) {
    return {
      body: {
        error: 'Could not build menu items from this link',
        details:
          'We read the page but could not list the dishes. Try again in a minute, or upload photos of your menu instead.',
        code: 'PARSE_FAILED',
      },
      status: 400,
    }
  }

  return {
    body: {
      error: 'Failed to import menu from URL',
      details: sanitizeErrorForClient(message),
    },
    status: 500,
  }
}

async function executeMenuImport(params: {
  menuUrl: string
  categoryNames: string[]
  onProgress?: ImportProgressFn
}): Promise<{
  items: ReturnType<typeof mapProcessedItems>
  source: string
  fetchMethod: string | null
}> {
  const { menuUrl, categoryNames, onProgress } = params
  const progress = onProgress ?? (() => {})

  logImportFromUrl('Import started', { url: menuUrl })
  progress('start', 'Getting started…')

  const config = await getPlatformConfig()
  const rawDb = await getRawPlatformConfig()
  const dbTavilyKey =
    typeof rawDb.tavilyApiKey === 'string' ? rawDb.tavilyApiKey.trim() : undefined
  const tavilyApiKey = config.tavilyApiKey
  const tavilyDiag = getTavilyKeyDiagnostics(dbTavilyKey, tavilyApiKey)

  const hasGemini = !!(config.geminiApiKey || process.env.GOOGLE_AI_KEY)
  const hasOpenAI = !!(config.openaiApiKey || process.env.OPENAI_API_KEY)
  const hasAnthropic = !!(config.anthropicApiKey || process.env.ANTHROPIC_API_KEY)

  describeAiKeys({
    tavily: tavilyDiag,
    gemini: hasGemini,
    openai: hasOpenAI,
    anthropic: hasAnthropic,
  })

  if (!hasGemini && !hasOpenAI) {
    throw new Error('Menu import is not available right now. Please try again later or contact support.')
  }

  const { pageText, fetchError, fetchMethod } = await fetchMenuPageText(
    menuUrl,
    tavilyApiKey,
    (phase, message) => progress(phase, message)
  )

  const usedTavily = fetchMethod === 'tavily-extract' || fetchMethod === 'tavily-search'

  if (fetchMethod && pageText) {
    logImportFromUrl('Page text ready for AI extraction', {
      method: fetchMethod,
      textChars: pageText.length,
    })
  }

  let items: ExtractedItem[] = []
  let source = 'page-text'

  if (pageText && pageText.length >= MIN_MENU_PAGE_TEXT_LENGTH) {
    progress('extract', 'Finding dishes and prices…')
    logImportFromUrl('Fast menu extraction', { textChars: pageText.length, usedTavily })

    const fastResult = await extractMenuFromPageTextFast(pageText, categoryNames, {
      hasOpenAI,
      hasGemini,
      hasAnthropic,
    })
    items = fastResult.items
    if (fastResult.provider) source = `page-text-${fastResult.provider}`
    logImportFromUrl('Fast extraction finished', {
      itemCount: items.length,
      provider: fastResult.provider ?? 'none',
      sawOverload: fastResult.sawOverload,
    })

    if (items.length > 0) {
      progress('extract', 'Almost done…')
    } else if (fastResult.sawOverload) {
      throw Object.assign(
        new Error('Menu import is busy right now. Please wait a minute and try again.'),
        { code: 'AI_OVERLOADED' }
      )
    } else if (usedTavily) {
      throw new Error(
        'We read the menu page but could not list dishes. Try again in a minute, or use Import from image for this menu.'
      )
    } else if (hasGemini) {
      progress('extract', 'Trying another way to read your menu…')
      warnImportFromUrl('Fast extraction empty without Tavily — trying URL context once')
      items = await extractWithGeminiUrlContext(menuUrl, categoryNames)
      source = 'url-context'
    }
  } else if (hasGemini && !usedTavily) {
    progress('extract', 'Reading your menu link…')
    warnImportFromUrl('No page text — single URL context attempt (no Tavily)')
    items = await extractWithGeminiUrlContext(menuUrl, categoryNames)
    source = 'url-context'
  } else if (fetchError) {
    throw fetchError
  } else {
    throw new Error('Could not extract enough text from this URL. Try a direct menu page or image import.')
  }

  if (items.length === 0) {
    const jsMenuSite = isJsRenderedMenuSite(menuUrl)
    const blockedMessage = jsMenuSite && !tavilyApiKey
      ? 'We could not read this digital menu from the link. Try uploading photos of your menu instead.'
      : 'No menu items found on this page. Make sure the URL is a public menu or food list.'
    throw new Error(blockedMessage)
  }

  progress('enrich', 'Filling recipes, ingredients, and nutrition…')
  items = await enrichMenuItemsFullForm(items, {
    hasGemini,
    hasOpenAI,
    onProgress: progress,
  })

  const processedItems = mapProcessedItems(items)

  logImportFromUrl('Import succeeded', {
    itemCount: processedItems.length,
    source,
    fetchMethod: fetchMethod ?? 'n/a',
  })

  progress('done', 'Done!')

  return { items: processedItems, source, fetchMethod }
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
    const useStream = body.stream === true

    if (!menuUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    try {
      new URL(menuUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const categoryNames = Array.isArray(body.categoryNames)
      ? body.categoryNames.filter((c: unknown): c is string => typeof c === 'string')
      : []

    if (useStream) {
      const encoder = new TextEncoder()
      const SSE_HEARTBEAT_MS = 10_000
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: Record<string, unknown>) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            } catch {
              // client disconnected
            }
          }

          let heartbeatTimer: ReturnType<typeof setInterval> | null = null
          const startHeartbeat = () => {
            heartbeatTimer = setInterval(() => {
              send({ type: 'heartbeat' })
            }, SSE_HEARTBEAT_MS)
          }
          const stopHeartbeat = () => {
            if (heartbeatTimer) {
              clearInterval(heartbeatTimer)
              heartbeatTimer = null
            }
          }

          startHeartbeat()

          try {
            const config = await getPlatformConfig()
            tavilyApiKey = config.tavilyApiKey

            const result = await executeMenuImport({
              menuUrl,
              categoryNames,
              onProgress: (_phase, message) => send({ type: 'progress', message }),
            })

            send({
              type: 'complete',
              success: true,
              items: result.items,
              source: result.source,
            })
          } catch (error) {
            errorImportFromUrl('Import failed', error)
            const { body: errBody, status } = importErrorResponse(error, menuUrl, tavilyApiKey)
            send({ type: 'error', ...errBody, status })
          } finally {
            stopHeartbeat()
            controller.close()
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    }

    const result = await executeMenuImport({ menuUrl, categoryNames })
    tavilyApiKey = (await getPlatformConfig()).tavilyApiKey

    return NextResponse.json({
      success: true,
      items: result.items,
      source: result.source,
    })
  } catch (error) {
    errorImportFromUrl('Import failed', error)
    const { body: errBody, status } = importErrorResponse(error, menuUrl, tavilyApiKey)
    return NextResponse.json(errBody, { status })
  }
}
