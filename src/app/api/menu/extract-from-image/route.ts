import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.GOOGLE_AI_KEY) {
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

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    })

    const prompt = `You are analyzing a restaurant menu image. Extract ALL menu items visible in this image.

For each menu item, provide complete recipe information:
1. **name**: The exact name of the dish
2. **description**: A brief description (if visible on menu, otherwise create a compelling one based on the name)
3. **categoryName**: Best-fit category name (e.g., "Drinks", "Main Dishes", "Desserts", "Sides", "Appetizers")
4. **price**: The price in numbers only (if visible, otherwise estimate a reasonable price between 1000-5000 IQD based on the type of dish)
5. **calories**: Estimate calories if not shown
6. **tags**: Array of dietary tags like ["vegetarian", "spicy", "halal", "seafood", "vegan", "gluten-free", etc.]
7. **recipeSteps**: Array of step-by-step cooking instructions (create logical steps based on the dish name)
8. **recipeTips**: Array of helpful cooking tips for this dish
9. **prepTime**: Estimated preparation time (e.g., "15 min")
10. **cookTime**: Estimated cooking time (e.g., "30 min")
11. **recipeYield**: Number of servings this recipe makes (default to 1 for single serving)
12. **ingredients**: Array of ingredients needed with {name, quantity, unit, pieceCount}
    - Use appropriate units: kg for meats/vegetables, g for small amounts, cup for rice/lentils, tsp/tbsp for spices, L for liquids
    - pieceCount for countable items like "2 onions", otherwise null

Return ONLY a valid JSON array in this exact format, no additional text:
[
  {
    "name": "Grilled Chicken",
    "description": "Tender grilled chicken breast with herbs",
    "categoryName": "Main Dishes",
    "price": 2500,
    "calories": 350,
    "tags": ["protein-rich", "halal"],
    "recipeSteps": ["Marinate chicken with herbs and spices for 30 minutes", "Preheat grill to medium-high heat", "Grill chicken for 6-7 minutes per side until cooked through", "Let rest for 5 minutes before serving"],
    "recipeTips": ["Don't overcook to keep the chicken juicy", "Let the chicken rest before slicing to retain moisture"],
    "prepTime": "15 min",
    "cookTime": "20 min",
    "recipeYield": 1,
    "ingredients": [
      {"name": "chicken breast", "quantity": 0.2, "unit": "kg", "pieceCount": null},
      {"name": "olive oil", "quantity": 2, "unit": "tbsp", "pieceCount": null},
      {"name": "garlic", "quantity": 3, "unit": "g", "pieceCount": 2},
      {"name": "mixed herbs", "quantity": 1, "unit": "tsp", "pieceCount": null}
    ]
  }
]

IMPORTANT:
- Extract ALL items from the menu, not just a few
- If prices are in a different currency, convert to IQD
- Be thorough and extract every single menu item visible
- Create realistic recipe steps, tips, and ingredient lists for each dish
- Return valid JSON only, no markdown, no explanations`

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
    console.log('Raw Gemini response:', response)

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
    return NextResponse.json(
      {
        error: 'Failed to extract menu items',
        details: sanitizeErrorForClient(error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 500 }
    )
  }
}
