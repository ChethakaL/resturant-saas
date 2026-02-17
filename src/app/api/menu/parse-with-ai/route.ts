import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

export interface ParsedIngredient {
  name: string
  quantity: number
  unit: string
  pieceCount?: number | null
}

export interface ParseWithAIResponse {
  name: string
  description: string
  price: number
  categoryName: string
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  tags?: string[]
  recipeSteps?: string[]
  recipeTips?: string[]
  prepTime?: string | null
  cookTime?: string | null
  recipeYield?: number | null
  ingredients?: ParsedIngredient[]
}

const JSON_SCHEMA = `
Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "name": "Dish name",
  "description": "Short menu description",
  "price": 0,
  "categoryName": "e.g. Main Course, Appetizer, Dessert, Drinks",
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "tags": ["halal", "spicy"],
  "recipeSteps": ["Step 1", "Step 2"],
  "recipeTips": ["Tip 1", "Tip 2"],
  "prepTime": "10 min",
  "cookTime": "25 min",
  "recipeYield": null,
  "ingredients": [{"name": "chicken", "quantity": 0.2, "unit": "kg", "pieceCount": null}, {"name": "rice", "quantity": 0.15, "unit": "kg", "pieceCount": null}]
}
RULES:
- categoryName: one short label. price in IQD if not specified.
- calories, protein (g), carbs (g): If the user provides these, use them. If NOT, ESTIMATE from dish name/description/category. Never use null when you have a dish name.
- tags: Use if given; else suggest (halal, vegetarian, spicy, etc.).
- recipeSteps: Extract from "Steps:", numbered lines, or recipe text. Each step one string.
- recipeTips: Extract from "Tips:", "Tip:", or bullet points. Put each tip as a separate string. If the user gives tips, you MUST include them in recipeTips.
- prepTime, cookTime: extract if present; else null.
- recipeYield: extract the number of servings/portions this recipe makes (e.g. "Serves 4" -> 4, "Yields 10" -> 10). Return null if not mentioned.
- ingredients: Extract from the user text (ingredient lists, recipe steps, "marinate with X", "add Y"). Each item: name (string), quantity (number), unit (kg for meats/veg, g for small, cup for rice/lentils, tsp/tbsp for spices, L for liquids), pieceCount (number for countable items like "2 onions", else null). If no ingredients mentioned, use empty array [].`

async function parseWithGemini(text: string, categoryNames: string[]): Promise<ParseWithAIResponse> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('Google AI API key not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (pick the closest match): ${categoryNames.join(', ')}.`
      : 'Suggest a short category name like Main Course, Appetizer, Dessert, Drinks, Sides.'

  const prompt = `You are helping fill a restaurant menu form. The user provided this description:

"""
${text}
"""

${categoryHint}

Extract: name, description, price (IQD), categoryName, recipeSteps, recipeTips, prepTime, cookTime, recipeYield, ingredients.
- recipeSteps: from "Steps:" or numbered instructions. recipeTips: from "Tips:" or tip bullets—always extract these if the user provided any.
- recipeYield: number of servings this recipe makes (null if not mentioned).
- ingredients: list of {name, quantity, unit, pieceCount} inferred from the text (ingredient lists, recipe steps). Use kg/g/cup/tsp/tbsp/L; pieceCount for countable items.
For calories/protein/carbs: use if given, else estimate. For tags: use if given, else suggest.
${JSON_SCHEMA}`

  const result = await model.generateContent(prompt)
  const raw = result.response.text()
  return parseJsonResponse(raw)
}

async function parseWithOpenAI(text: string, categoryNames: string[]): Promise<ParseWithAIResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const openai = new OpenAI({ apiKey })
  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (pick closest): ${categoryNames.join(', ')}.`
      : 'Suggest a short category name like Main Course, Appetizer, Dessert.'

  const prompt = `You are helping fill a restaurant menu form. The user provided:

"""
${text}
"""

${categoryHint}

Extract: name, description, price (IQD), categoryName, recipeSteps, recipeTips, prepTime, cookTime, recipeYield, ingredients.
- recipeSteps from steps/instructions; recipeTips from "Tips:" or bullets—always include if user provided.
- recipeYield: number of servings (default null).
- ingredients: [{name, quantity, unit, pieceCount}] from ingredient lists or recipe text.
Calories/protein/carbs: use if given else estimate. Tags: use if given else suggest.
${JSON_SCHEMA}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  })
  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new Error('Empty response from OpenAI')
  return parseJsonResponse(raw)
}

function parseJsonResponse(raw: string): ParseWithAIResponse {
  let jsonText = raw.trim()
  jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
  const match = jsonText.match(/\{[\s\S]*\}/)
  if (match) jsonText = match[0]
  const data = JSON.parse(jsonText) as Record<string, unknown>

  return {
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    price: typeof data.price === 'number' ? data.price : 0,
    categoryName: typeof data.categoryName === 'string' ? data.categoryName : '',
    calories: typeof data.calories === 'number' ? data.calories : null,
    protein: typeof data.protein === 'number' ? data.protein : null,
    carbs: typeof data.carbs === 'number' ? data.carbs : null,
    tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : [],
    recipeSteps: Array.isArray(data.recipeSteps)
      ? data.recipeSteps.filter((s): s is string => typeof s === 'string')
      : [],
    recipeTips: Array.isArray(data.recipeTips)
      ? data.recipeTips.filter((t): t is string => typeof t === 'string')
      : [],
    prepTime: typeof data.prepTime === 'string' ? data.prepTime : null,
    cookTime: typeof data.cookTime === 'string' ? data.cookTime : null,
    recipeYield: typeof data.recipeYield === 'number' ? data.recipeYield : null,
    ingredients: parseIngredients(data.ingredients),
  }
}

function parseIngredients(raw: unknown): ParsedIngredient[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): ParsedIngredient | null => {
      if (!item || typeof item !== 'object' || !('name' in item) || typeof (item as any).name !== 'string') return null
      const name = (item as any).name.trim()
      if (!name) return null
      const quantity = typeof (item as any).quantity === 'number' ? (item as any).quantity : 1
      const unit = typeof (item as any).unit === 'string' ? (item as any).unit : 'kg'
      const pieceCount = typeof (item as any).pieceCount === 'number' ? (item as any).pieceCount : null
      return { name, quantity, unit, pieceCount }
    })
    .filter((x): x is ParsedIngredient => x !== null)
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const categoryNames = Array.isArray(body.categoryNames)
      ? body.categoryNames.filter((c): c is string => typeof c === 'string')
      : []

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    const hasGemini = !!process.env.GOOGLE_AI_KEY
    const hasOpenAI = !!process.env.OPENAI_API_KEY

    if (!hasGemini && !hasOpenAI) {
      return NextResponse.json(
        { error: 'No AI API key configured. Set GOOGLE_AI_KEY or OPENAI_API_KEY in .env' },
        { status: 500 }
      )
    }

    let result: ParseWithAIResponse
    if (hasGemini) {
      try {
        result = await parseWithGemini(text, categoryNames)
      } catch (err) {
        if (hasOpenAI) {
          result = await parseWithOpenAI(text, categoryNames)
        } else {
          throw err
        }
      }
    } else {
      result = await parseWithOpenAI(text, categoryNames)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Parse menu with AI error:', error)
    return NextResponse.json(
      {
        error: 'Failed to parse description',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
