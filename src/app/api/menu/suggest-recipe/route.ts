import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.GOOGLE_AI_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    const { itemName, description, additionalInstructions } = await request.json()

    if (!itemName) {
      return NextResponse.json(
        { error: 'Item name is required' },
        { status: 400 }
      )
    }

    // Get existing ingredients from the database
    const existingIngredients = await prisma.ingredient.findMany({
      where: { restaurantId: session.user.restaurantId },
      select: { id: true, name: true, unit: true, costPerUnit: true },
    })

    const ingredientNames = existingIngredients.map((i) => `${i.name} (${i.unit})`).join(', ')

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
    })

    let prompt = `You are a professional chef helping create a recipe for "${itemName}".`

    if (description) {
      prompt += ` Description: ${description}.`
    }

    if (additionalInstructions) {
      prompt += ` Additional instructions from the user: ${additionalInstructions}.`
    }

  prompt += `

The restaurant has these ingredients available: ${ingredientNames || 'No ingredients in inventory yet'}.

You must tailor the recipe to a single serving and obey the following portion guidelines:
  - Keep vegetables/fruits under 0.25 kg per serving (e.g., 2 tomatoes ~0.15 kg) and provide piece counts for countable items.
  - Dry goods like lentils, rice, beans should never exceed 2 cups per serving.
  - Liquids should stay below 0.2 L per serving unless a broth is required, and spices should be under 2 tbsp.
  - Always fill the \`pieceCount\` field when you refer to whole onions, tomatoes, eggs, cloves, etc., otherwise leave it null.
  - Use realistic per-serving quantities; avoid suggesting 1 kg of turmeric or 1 kg of tomatoes unless you explain they will be stretched across the batch.

Please provide a detailed recipe with:
1. A list of ingredients with quantities using appropriate units:
   - Dry goods (lentils, rice, beans, grains): use "cups" (e.g., 1.5 cups)
   - Vegetables/Fruits: use "kg" or "g" with count (e.g., 0.2 kg for 2 onions)
   - Liquids: use "L" or "ml" (e.g., 0.5 L water)
   - Spices/seasonings: use "tsp" or "tbsp" (e.g., 1 tsp cumin)
   - Small quantities: use "g" (e.g., 20g butter)
2. Step-by-step cooking instructions
3. Estimated cooking time
4. Estimated calories per serving
5. Any tips for best results

IMPORTANT: Return your response in this exact JSON format, replacing the placeholder numbers with realistic values:
{
  "recipeName": "Name of the dish",
  "servings": 1,
  "prepTime": "10 minutes",
  "cookTime": "20 minutes",
  "price": 0,
  "calories": 0,
  "ingredients": [
    {
      "name": "Ingredient name",
      "quantity": 0.5,
      "unit": "kg",
      "pieceCount": 2,
      "isAvailable": true,
      "notes": "optional notes"
    }
  ],
  "steps": [
    "Step 1 description",
    "Step 2 description"
  ],
  "tips": [
    "Tip 1",
    "Tip 2"
  ],
  "dietaryTags": ["halal", "protein-rich"]
}

IMPORTANT FOR INGREDIENTS:
- Use appropriate units: cups for lentils/rice/beans, kg for vegetables, tsp/tbsp for spices, L/ml for liquids
- For countable items (tomatoes, onions, eggs, carrots, etc.), include "pieceCount" with the count
- The "quantity" should be the weight/volume measurement
- The "pieceCount" should be the number of whole items (e.g., 2 for 2 onions) - set to null for non-countable items
- For each ingredient, check if it matches one from the available ingredients list. Set "isAvailable" to true if available, false if not.
Return ONLY valid JSON, no additional text or markdown.`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // Clean and parse JSON
    let jsonText = responseText.trim()
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    let recipe
    try {
      recipe = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse recipe JSON:', jsonText)
      throw new Error('Failed to parse recipe from AI response')
    }

    // Match ingredients with existing ones
    const matchedIngredients = recipe.ingredients.map((ing: any) => {
      const match = existingIngredients.find(
        (existing) =>
          existing.name.toLowerCase().includes(ing.name.toLowerCase()) ||
          ing.name.toLowerCase().includes(existing.name.toLowerCase())
      )

      return {
        ...ing,
        pieceCount: ing.pieceCount || null,
        existingIngredientId: match?.id || null,
        existingIngredientName: match?.name || null,
        existingIngredientUnit: match?.unit || null,
        costPerUnit: match?.costPerUnit || null,
        isAvailable: !!match,
      }
    })

    return NextResponse.json({
      success: true,
      recipe: {
        ...recipe,
        ingredients: matchedIngredients,
      },
      existingIngredients,
    })
  } catch (error) {
    console.error('Error suggesting recipe:', error)
    return NextResponse.json(
      {
        error: 'Failed to suggest recipe',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
