import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

    const { itemName, description, category } = await request.json()

    if (!itemName) {
      return NextResponse.json(
        { error: 'Item name is required' },
        { status: 400 }
      )
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    })

    const prompt = `You are a professional nutritionist. Estimate the nutritional values for a single serving of this dish:

Dish name: "${itemName}"
${description ? `Description: ${description}` : ''}
${category ? `Category: ${category}` : ''}

Based on typical restaurant portions for Middle Eastern/Iraqi cuisine, estimate:
1. Calories (kcal) - for a standard restaurant serving
2. Protein (grams) - total protein content
3. Carbohydrates (grams) - total carbs

Consider typical ingredients and portion sizes. Be realistic - a main dish might have 300-700 calories, appetizers 100-300 calories, desserts 200-500 calories.

IMPORTANT: Return your response as JSON that matches this structure (replace the placeholder values with the actual estimates):
{
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "reasoning": "Brief explanation of the estimate"
}

Use numbers for calories/protein/carbs and base your reasoning on the provided dish details. Return ONLY valid JSON, no markdown or additional text.`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // Clean and parse JSON
    let jsonText = responseText.trim()
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    let nutrition
    try {
      nutrition = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse nutrition JSON:', jsonText)
      throw new Error('Failed to parse nutrition data from AI response')
    }

    return NextResponse.json({
      success: true,
      calories: Math.round(nutrition.calories || 0),
      protein: Math.round(nutrition.protein || 0),
      carbs: Math.round(nutrition.carbs || 0),
      reasoning: nutrition.reasoning || '',
    })
  } catch (error) {
    console.error('Error estimating nutrition:', error)
    return NextResponse.json(
      {
        error: 'Failed to estimate nutrition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
