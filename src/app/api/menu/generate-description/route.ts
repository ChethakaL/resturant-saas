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

    const { itemName, category, tags } = await request.json()

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

    const prompt = `You are a menu description writer for a Middle Eastern restaurant. Write an appetizing, concise menu description for:

Dish name: "${itemName}"
${category ? `Category: ${category}` : ''}
${tags ? `Dietary tags: ${tags}` : ''}

Guidelines:
- Keep it to 1-2 sentences (maximum 150 characters)
- Highlight key ingredients or cooking methods
- Use appetizing, evocative language
- Don't use generic phrases like "delicious" or "amazing"
- Be specific about what makes this dish special
- Suitable for a restaurant menu

IMPORTANT: Return your response in this exact JSON format only:
{
  "description": "Your menu description here"
}

Return ONLY valid JSON, no markdown or additional text.`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // Clean and parse JSON
    let jsonText = responseText.trim()
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    let data
    try {
      data = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse description JSON:', jsonText)
      throw new Error('Failed to parse description from AI response')
    }

    return NextResponse.json({
      success: true,
      description: data.description || '',
    })
  } catch (error) {
    console.error('Error generating description:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate description',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
