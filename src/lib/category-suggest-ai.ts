import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import type { DefaultCategoryKey } from './category-suggest'

const AI_CATEGORIES: DefaultCategoryKey[] = [
  'Main Dishes',
  'Shareables',
  'Add-ons',
  'Drinks',
  'Desserts',
  'Kids',
  'Sides',
]

const BATCH_SIZE = 25

export interface ItemForAIClassify {
  id: string
  name: string
  description?: string | null
}

/**
 * Call Gemini to classify menu items into standard categories. Returns a map itemId -> category key.
 * Does not assign Signature Dishes (caller does that by margin/popularity).
 */
async function classifyWithGemini(
  items: ItemForAIClassify[]
): Promise<Map<string, DefaultCategoryKey>> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_KEY not set')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const lines = items.map((item, i) => {
    const desc = item.description?.trim()
    return `${i + 1}. ${item.name}${desc ? ` — ${desc}` : ''}`
  })

  const prompt = `You are a restaurant menu expert. Classify each menu item below into exactly one of these categories: ${AI_CATEGORIES.join(', ')}.

Rules:
- Main Dishes: entrees, grills, kebabs, biryani, pasta, burgers, pizzas, rice mains, platters that are full meals.
- Shareables: appetizers, starters, mezze, dips, hummus, falafel, small plates meant for sharing.
- Add-ons: extras, toppings, sides that are add-ons, upgrades.
- Drinks: any beverage (coffee, tea, juice, soda, cocktails, mocktails, water).
- Desserts: sweets, cakes, pastries, baklava, ice cream, cookies.
- Kids: items for children / kids menu.
- Sides: side dishes, salads, rice sides, fries, bread, raita, yogurt side (not drinks).

Return ONLY a JSON array of category names in the same order as the list (one category per item). No explanation.
Example: ["Main Dishes","Shareables","Drinks"]

Menu items:
${lines.join('\n')}`

  const result = await model.generateContent(prompt)
  const raw = result.response.text()
  return parseAiCategoriesResponse(raw, items)
}

/**
 * Call OpenAI to classify menu items. Same contract as Gemini.
 */
async function classifyWithOpenAI(
  items: ItemForAIClassify[]
): Promise<Map<string, DefaultCategoryKey>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const openai = new OpenAI({ apiKey })

  const lines = items.map((item, i) => {
    const desc = item.description?.trim()
    return `${i + 1}. ${item.name}${desc ? ` — ${desc}` : ''}`
  })

  const prompt = `You are a restaurant menu expert. Classify each menu item below into exactly one of these categories: ${AI_CATEGORIES.join(', ')}.

Rules:
- Main Dishes: entrees, grills, kebabs, biryani, pasta, burgers, pizzas, rice mains, full meal platters.
- Shareables: appetizers, starters, mezze, dips, hummus, falafel, small plates for sharing.
- Add-ons: extras, toppings, add-on sides, upgrades.
- Drinks: any beverage (coffee, tea, juice, soda, cocktails, mocktails, water).
- Desserts: sweets, cakes, pastries, baklava, ice cream, cookies.
- Kids: items for children / kids menu.
- Sides: side dishes, salads, rice sides, fries, bread, raita, yogurt side (not drinks).

Return ONLY a JSON array of category names in the same order as the list (one per item). No explanation.
Example: ["Main Dishes","Shareables","Drinks"]

Menu items:
${lines.join('\n')}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  })
  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new Error('Empty OpenAI response')
  const text = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(text) as unknown
  let arr: unknown[] = []
  if (Array.isArray(parsed)) arr = parsed
  else if (parsed && typeof parsed === 'object' && 'categories' in parsed) arr = (parsed as { categories: unknown[] }).categories ?? []
  else if (parsed && typeof parsed === 'object' && 'assignments' in parsed) arr = (parsed as { assignments: unknown[] }).assignments ?? []
  else if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed as Record<string, unknown>).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b))
    arr = keys.map((k) => (parsed as Record<string, unknown>)[k])
  }
  return normaliseAiCategoriesToMap(arr, items)
}

function parseAiCategoriesResponse(
  raw: string,
  items: ItemForAIClassify[]
): Map<string, DefaultCategoryKey> {
  let text = raw.trim()
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array in AI response')
  const arr = JSON.parse(match[0]) as unknown[]
  return normaliseAiCategoriesToMap(arr, items)
}

function normaliseAiCategoriesToMap(
  arr: unknown[],
  items: ItemForAIClassify[]
): Map<string, DefaultCategoryKey> {
  const map = new Map<string, DefaultCategoryKey>()
  const allowed = new Set<string>(AI_CATEGORIES)
  const normalised = new Map<string, DefaultCategoryKey>()
  for (const c of AI_CATEGORIES) {
    normalised.set(c.toLowerCase(), c)
  }
  // Common AI variations
  normalised.set('main dish', 'Main Dishes')
  normalised.set('main course', 'Main Dishes')
  normalised.set('shareable', 'Shareables')
  normalised.set('add-on', 'Add-ons')
  normalised.set('addons', 'Add-ons')
  normalised.set('drink', 'Drinks')
  normalised.set('dessert', 'Desserts')
  normalised.set('kid', 'Kids')
  normalised.set('side', 'Sides')
  normalised.set('appetizer', 'Shareables')
  normalised.set('appetizers', 'Shareables')
  normalised.set('beverages', 'Drinks')
  normalised.set('beverage', 'Drinks')

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const raw = Array.isArray(arr) ? arr[i] : null
    const str = typeof raw === 'string' ? raw.trim() : ''
    const key = normalised.get(str.toLowerCase()) ?? normalised.get(str.toLowerCase().replace(/s$/, ''))
    const category: DefaultCategoryKey = key && allowed.has(key) ? key : 'Main Dishes'
    map.set(item.id, category)
  }
  return map
}

/**
 * Classify menu items with AI (Gemini first, then OpenAI fallback).
 * Batches items to stay under token limits. Returns itemId -> category key (excluding Signature Dishes).
 */
export async function classifyCategoriesWithAI(
  items: ItemForAIClassify[]
): Promise<Map<string, DefaultCategoryKey>> {
  if (items.length === 0) return new Map()

  const result = new Map<string, DefaultCategoryKey>()
  const hasGemini = !!process.env.GOOGLE_AI_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY

  if (!hasGemini && !hasOpenAI) {
    throw new Error('No AI API key. Set GOOGLE_AI_KEY or OPENAI_API_KEY in .env')
  }

  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = items.slice(start, start + BATCH_SIZE)
    let batchMap: Map<string, DefaultCategoryKey>
    if (hasGemini) {
      try {
        batchMap = await classifyWithGemini(batch)
      } catch (err) {
        if (hasOpenAI) {
          batchMap = await classifyWithOpenAI(batch)
        } else {
          throw err
        }
      }
    } else {
      batchMap = await classifyWithOpenAI(batch)
    }
    for (const [id, cat] of batchMap) result.set(id, cat)
  }

  return result
}
