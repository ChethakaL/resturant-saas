import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.GOOGLE_AI_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    const { imageData } = await request.json()

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

For each menu item, provide:
1. **name**: The exact name of the dish
2. **description**: A brief description (if visible on menu, otherwise create a compelling one based on the name)
3. **price**: The price in numbers only (if visible, otherwise estimate a reasonable price between 1000-5000 IQD based on the type of dish)
4. **calories**: Estimate calories if not shown
5. **tags**: Array of dietary tags like ["vegetarian", "spicy", "halal", "seafood", "vegan", "gluten-free", etc.]

Return ONLY a valid JSON array in this exact format, no additional text:
[
  {
    "name": "Grilled Chicken",
    "description": "Tender grilled chicken breast with herbs",
    "price": 2500,
    "calories": 350,
    "tags": ["protein-rich", "halal"]
  }
]

IMPORTANT:
- Extract ALL items from the menu, not just a few
- If prices are in a different currency, convert to IQD
- Be thorough and extract every single menu item visible
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

    let items
    try {
      items = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse JSON:', jsonText)
      throw new Error('Failed to parse menu items from AI response')
    }

    if (!Array.isArray(items)) {
      throw new Error('AI response is not an array of menu items')
    }

    // Ensure all items have required fields
    const processedItems = items.map((item: any) => ({
      name: item.name || 'Unnamed Item',
      description: item.description || '',
      price: parseFloat(item.price) || 2000,
      calories: parseInt(item.calories) || null,
      tags: Array.isArray(item.tags) ? item.tags : [],
      verified: false,
    }))

    console.log(`Extracted ${processedItems.length} menu items`)

    return NextResponse.json({
      success: true,
      items: processedItems,
    })
  } catch (error) {
    console.error('Error extracting menu items:', error)
    return NextResponse.json(
      {
        error: 'Failed to extract menu items',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
