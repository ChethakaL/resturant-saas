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
  return status === 503 || /503|Service Unavailable|high demand|try again later/i.test(message)
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

    const prompt = `You are analyzing a restaurant menu image. Extract every menu item visible in this image.

Return ONLY a valid JSON array. No markdown. No comments. No trailing text.

For each item include only these fields:
- name: exact dish/drink name
- description: visible description if present; otherwise short plain description from name
- categoryName: visible category or best-fit category
- price: visible price as a number only. Do not convert currency. If no price is visible, use 0
- calories: visible calories as a number, otherwise null
- tags: short dietary/category tags only when obvious, otherwise []

Use this exact format:
[
  {
    "name": "Grilled Chicken",
    "description": "Tender grilled chicken breast with herbs",
    "categoryName": "Main Dishes",
    "price": 2500,
    "calories": 350,
    "tags": ["protein-rich", "halal"]
  }
]

IMPORTANT:
- Extract ALL items from the menu, not just a few
- Preserve menu prices exactly as numbers
- Do not invent recipes, ingredients, prep times, or cooking tips
- If image is dense, prioritize complete names and prices over descriptions`

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

    // If there are missing ingredients and user hasn't confirmed yet, return them for confirmation
    if (allMissingIngredients.size > 0 && !confirmMissingIngredients) {
      return NextResponse.json({
        success: false,
        requiresConfirmation: true,
        missingIngredients: Array.from(allMissingIngredients),
        items: processedItems,
        message: `Found ${allMissingIngredients.size} missing ingredients. Please confirm to add them to inventory.`
      })
    }

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
        { error: 'AI model is not available, Please Try Again Later' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to extract menu items',
        details: sanitizeErrorForClient(error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 500 }
    )
  }
}
