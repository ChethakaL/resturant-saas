import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { callGemini, parseGeminiJson } from '@/lib/generative'
import { sanitizeErrorForClient } from '@/lib/sanitize-error'

type DraftIngredient = {
  name: string
  quantity: number
  unit: string
  pieceCount?: number | null
}

type ImportDraft = {
  name: string
  description: string
  price: number
  categoryName?: string | null
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  tags?: string[]
  status?: 'DRAFT' | 'ACTIVE'
  available?: boolean
  prepTime?: string | null
  cookTime?: string | null
  recipeYield?: number | null
  recipeSteps?: string[]
  recipeTips?: string[]
  ingredients?: DraftIngredient[]
  addOnIds?: string[]
}

const ALLOWED_FIELDS = [
  'name',
  'description',
  'price',
  'categoryName',
  'calories',
  'protein',
  'carbs',
  'tags',
  'status',
  'available',
  'prepTime',
  'cookTime',
  'recipeYield',
  'recipeSteps',
  'recipeTips',
  'ingredients',
  'addOnIds',
] as const

function pickDraft(value: unknown): ImportDraft {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    name: String(input.name ?? ''),
    description: String(input.description ?? ''),
    price: Number(input.price) || 0,
    categoryName: typeof input.categoryName === 'string' ? input.categoryName : null,
    calories: typeof input.calories === 'number' ? input.calories : null,
    protein: typeof input.protein === 'number' ? input.protein : null,
    carbs: typeof input.carbs === 'number' ? input.carbs : null,
    tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    status: input.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
    available: typeof input.available === 'boolean' ? input.available : true,
    prepTime: typeof input.prepTime === 'string' ? input.prepTime : null,
    cookTime: typeof input.cookTime === 'string' ? input.cookTime : null,
    recipeYield: typeof input.recipeYield === 'number' ? input.recipeYield : null,
    recipeSteps: Array.isArray(input.recipeSteps)
      ? input.recipeSteps.filter((step): step is string => typeof step === 'string')
      : [],
    recipeTips: Array.isArray(input.recipeTips)
      ? input.recipeTips.filter((tip): tip is string => typeof tip === 'string')
      : [],
    ingredients: Array.isArray(input.ingredients)
      ? input.ingredients
          .filter((ingredient): ingredient is Record<string, unknown> => !!ingredient && typeof ingredient === 'object')
          .map((ingredient) => ({
            name: String(ingredient.name ?? ''),
            quantity: Number(ingredient.quantity) || 0,
            unit: String(ingredient.unit ?? 'g'),
            pieceCount:
              ingredient.pieceCount == null || ingredient.pieceCount === ''
                ? null
                : Number(ingredient.pieceCount) || null,
          }))
          .filter((ingredient) => ingredient.name.trim())
      : [],
    addOnIds: Array.isArray(input.addOnIds)
      ? input.addOnIds.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const draft = pickDraft(body.draft)
    const instruction = String(body.instruction ?? '').trim()
    const categories = Array.isArray(body.categories)
      ? body.categories.filter((category): category is string => typeof category === 'string')
      : []

    if (!instruction) {
      return NextResponse.json({ error: 'Instruction is required' }, { status: 400 })
    }

    const prompt = `You are Smart Chef editing one unsaved restaurant menu import draft.

Current draft JSON:
${JSON.stringify(draft, null, 2)}

Available category names:
${categories.join(', ') || 'None'}

User instruction:
${instruction}

Return ONLY valid JSON with this shape:
{
  "summary": "short human summary of the proposed edit",
  "targetTab": "basic" | "recipe" | "details",
  "changedFields": ["description", "ingredients"],
  "draft": {
    "name": "...",
    "description": "...",
    "price": 0,
    "categoryName": "...",
    "calories": null,
    "protein": null,
    "carbs": null,
    "tags": [],
    "status": "ACTIVE",
    "available": true,
    "prepTime": null,
    "cookTime": null,
    "recipeYield": null,
    "recipeSteps": [],
    "recipeTips": [],
    "ingredients": [{"name":"Lemon","quantity":20,"unit":"g","pieceCount":null}],
    "addOnIds": []
  }
}

Rules:
- Modify only fields needed by the instruction.
- Preserve existing fields unless instruction clearly changes them.
- If user asks recipe edits, update ingredients and recipeSteps when needed.
- Ingredients must use practical units: g, kg, ml, L, tsp, tbsp, cup, pcs.
- Use existing category name if category changes and there is a clear match.
- changedFields must list top-level draft fields that changed.
- targetTab: basic for name/price/category/description, recipe for ingredients/steps/tips/yield/times, details for calories/tags/image-adjacent metadata.`

    const result = await callGemini(prompt, { temperature: 0.2, maxOutputTokens: 3000 })
    const raw = result.response.text()
    const parsed = parseGeminiJson(raw) as Record<string, unknown>
    const nextDraft = pickDraft(parsed.draft)
    const changedFields = Array.isArray(parsed.changedFields)
      ? parsed.changedFields.filter((field): field is string =>
          (ALLOWED_FIELDS as readonly string[]).includes(field)
        )
      : []

    return NextResponse.json({
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Smart Chef proposed an edit.',
      targetTab:
        parsed.targetTab === 'recipe' || parsed.targetTab === 'details' || parsed.targetTab === 'basic'
          ? parsed.targetTab
          : 'basic',
      changedFields,
      draft: nextDraft,
    })
  } catch (error) {
    console.error('Import draft Smart Chef edit failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to edit imported item draft',
        details: sanitizeErrorForClient(error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 500 }
    )
  }
}
