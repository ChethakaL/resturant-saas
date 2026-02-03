import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { query } = await request.json()

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    if (!process.env.GOOGLE_AI_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    })

    // Use Gemini to search and summarize information
    const prompt = `Search the web and provide comprehensive information about: "${query}"

Please provide:
1. A clear summary of what you found
2. If it's a recipe, include:
   - List of ingredients with quantities
   - Basic cooking instructions
   - Estimated calories (if available)
   - Any dietary tags (vegetarian, vegan, gluten-free, spicy, etc.)
3. Key details that would be useful for creating a menu item

Format your response in a clear, structured way that's easy to read.`

    const result = await model.generateContent(prompt)
    const response = result.response.text()

    return NextResponse.json({
      query,
      results: response,
    })
  } catch (error) {
    console.error('Web search error:', error)
    return NextResponse.json(
      {
        error: 'Failed to search',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
