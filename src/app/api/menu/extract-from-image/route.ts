import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/platform-config'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { prisma } from '@/lib/prisma'
import { sanitizeErrorForClient } from '@/lib/sanitize-error'

interface ParsedIngredient {
  name: string
  quantity: number
  unit: string
  pieceCount?: number | null
}

interface ExtractedMenuItem {
  name: string
  description: string
  categoryName: string
  price: number
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  tags: string[]
  recipeSteps?: string[]
  recipeTips?: string[]
  prepTime?: string | null
  cookTime?: string | null
  recipeYield?: number | null
  ingredients?: ParsedIngredient[]
}

function isAiModelUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined
  return status === 503 || /503|Service Unavailable|overload|overloaded|high demand|try again later/i.test(message)
}

function isAiTimeout(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /timeout|timed out|deadline|aborted|ECONNRESET|fetch failed/i.test(message)
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await getPlatformConfig()
    const apiKey = config.geminiApiKey ?? process.env.GOOGLE_AI_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI API key not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { imageData, confirmMissingIngredients } = body

    if (!imageData) {
      return NextResponse.json(
        { error: 'No image data provided' },
        { status: 400 }
      )
    }

    // Extract base64 data
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData
    const mimeType = imageData.includes(',') ? imageData.split(',')[0].split(':')[1].split(';')[0] : 'image/jpeg'

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    })

    const prompt = `You are analyzing a restaurant menu image for a restaurant SaaS onboarding flow. Extract every menu item visible in this image and pre-fill the full menu item form.

Return ONLY a valid JSON array. No markdown. No comments. No trailing text.

For each item include these fields:
- name: exact dish/drink name
- description: visible description if present; otherwise generate a short sensory menu description, max 18 words
- categoryName: visible category or best-fit category
- price: visible price as a number only. Do not convert currency. If no price is visible, use 0
- calories: visible calories as a number, otherwise estimate per serving
- protein: estimate grams protein per serving, otherwise null for unclear drinks/desserts
- carbs: estimate grams carbs per serving, otherwise null if unclear
- tags: useful dietary/category tags, e.g. halal, spicy, vegetarian, protein-rich, fried
- prepTime: estimated prep time, e.g. "15 minutes"
- cookTime: estimated cook time, e.g. "20 minutes"
- recipeYield: estimated servings for this recipe; use 1 for individual restaurant portions
- ingredients: realistic recipe ingredients for one serving or one prep batch. Each ingredient must have name, quantity, unit, pieceCount.
- recipeSteps: concise SOP cooking/service steps for kitchen staff
- recipeTips: concise chef notes for quality/consistency

Use this exact format:
[
  {
    "name": "Grilled Chicken",
    "description": "Tender grilled chicken breast with herbs",
    "categoryName": "Main Dishes",
    "price": 2500,
    "calories": 350,
    "protein": 32,
    "carbs": 8,
    "tags": ["protein-rich", "halal"],
    "prepTime": "15 minutes",
    "cookTime": "18 minutes",
    "recipeYield": 1,
    "ingredients": [
      {"name": "Chicken breast", "quantity": 0.22, "unit": "kg", "pieceCount": 1},
      {"name": "Olive oil", "quantity": 0.015, "unit": "L", "pieceCount": null},
      {"name": "Salt", "quantity": 3, "unit": "g", "pieceCount": null}
    ],
    "recipeSteps": ["Season chicken evenly.", "Grill until cooked through.", "Rest briefly and serve hot."],
    "recipeTips": ["Keep grill hot before adding chicken."]
  }
]

IMPORTANT:
- Extract ALL items from the menu, not just a few
- Preserve menu prices exactly as numbers
- For recipes, use standard restaurant knowledge when the menu image does not show recipe details
- Use practical units: kg, g, L, ml, tsp, tbsp, cup, pcs
- Keep ingredient quantities realistic for the recipeYield
- If image is dense, prioritize complete names/prices/categories, but still include best-effort generated form fields`

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      { text: prompt },
    ])

    const response = result.response.text()
    console.log(`Gemini menu image extraction response length: ${response.length}`)

    // Clean the response to extract JSON
    let jsonText = response.trim()

    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')

    // Try to find JSON array in the response
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    let items: ExtractedMenuItem[]
    try {
      items = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse JSON:', jsonText)
      throw new Error('Failed to parse menu items from AI response')
    }

    if (!Array.isArray(items)) {
      throw new Error('AI response is not an array of menu items')
    }

    // Fetch existing ingredients for this restaurant
    const existingIngredients = await prisma.ingredient.findMany({
      where: { restaurantId: session.user.restaurantId },
      select: { id: true, name: true, unit: true }
    })

    // Create a normalized map of existing ingredients
    const ingredientMap = new Map(
      existingIngredients.map(ing => [ing.name.toLowerCase().trim(), ing])
    )

    // Process each item and check for missing ingredients
    const allMissingIngredients = new Set<string>()
    const processedItems = items.map((item: any) => {
      const ingredients = Array.isArray(item.ingredients) ? item.ingredients : []

      // Check which ingredients are missing
      const missingIngredients: string[] = []
      ingredients.forEach((ing: ParsedIngredient) => {
        const normalizedName = ing.name.toLowerCase().trim()
        if (!ingredientMap.has(normalizedName)) {
          missingIngredients.push(ing.name)
          allMissingIngredients.add(ing.name)
        }
      })

      return {
        name: item.name || 'Unnamed Item',
        description: item.description || '',
        categoryName: typeof item.categoryName === 'string' ? item.categoryName : '',
        price: parseFloat(item.price) || 2000,
        calories: parseInt(item.calories) || null,
        protein: parseInt(item.protein) || null,
        carbs: parseInt(item.carbs) || null,
        tags: Array.isArray(item.tags) ? item.tags : [],
        recipeSteps: Array.isArray(item.recipeSteps) ? item.recipeSteps : [],
        recipeTips: Array.isArray(item.recipeTips) ? item.recipeTips : [],
        prepTime: typeof item.prepTime === 'string' ? item.prepTime : null,
        cookTime: typeof item.cookTime === 'string' ? item.cookTime : null,
        recipeYield: typeof item.recipeYield === 'number' ? item.recipeYield : 1,
        ingredients: ingredients,
        missingIngredients,
        verified: false,
      }
    })

    // Show generated draft recipes immediately. Missing ingredients stay flagged on each draft item
    // and can be added later when the user creates/finishes costing.

    // If user confirmed, create missing ingredients with 0 cost (to be filled manually)
    if (confirmMissingIngredients && allMissingIngredients.size > 0) {
      const ingredientsToCreate = Array.from(allMissingIngredients).map((name) => {
        // Find the first occurrence to get unit info
        const sampleIngredient = processedItems
          .flatMap(item => item.ingredients || [])
          .find(ing => ing.name.toLowerCase().trim() === name.toLowerCase().trim())

        const unit = sampleIngredient?.unit || 'kg'

        return {
          name,
          unit,
          stockQuantity: 0,
          costPerUnit: 0,
          minStockLevel: 0,
          restaurantId: session.user.restaurantId!,
          notes: 'Auto-created from menu image import. ⚠️ COSTING INCOMPLETE - Please update cost per unit with actual supplier prices.'
        }
      })

      await prisma.ingredient.createMany({
        data: ingredientsToCreate,
        skipDuplicates: true
      })

      console.log(`Created ${ingredientsToCreate.length} new ingredients - costing incomplete`)
    }

    console.log(`Extracted ${processedItems.length} menu items with recipes`)

    return NextResponse.json({
      success: true,
      items: processedItems,
      ingredientsCreated: confirmMissingIngredients ? allMissingIngredients.size : 0
    })
  } catch (error) {
    console.error('Error extracting menu items:', error)
    if (isAiModelUnavailable(error)) {
      return NextResponse.json(
        {
          error: 'AI is busy right now',
          details: 'The menu import AI service is overloaded. Please wait a minute and try importing the same image again.',
          code: 'AI_OVERLOADED',
        },
        { status: 503 }
      )
    }

    if (isAiTimeout(error)) {
      return NextResponse.json(
        {
          error: 'Menu import took too long',
          details: 'The image may be large or the AI service may be slow. Please try again, or upload a clearer/smaller menu image.',
          code: 'AI_TIMEOUT',
        },
        { status: 504 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to extract menu items',
        details: sanitizeErrorForClient(error instanceof Error ? error.message : 'Unknown error'),
        code: 'EXTRACTION_FAILED',
      },
      { status: 500 }
    )
  }
}
