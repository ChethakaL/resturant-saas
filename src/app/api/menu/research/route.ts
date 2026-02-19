import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

interface RecipeSearchResult {
    title: string
    url: string
    content: string
}

async function searchTavily(query: string): Promise<RecipeSearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) return []

    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: apiKey,
                query: `recipe for ${query}`,
                search_depth: 'advanced',
                max_results: 3,
            }),
        })

        if (!res.ok) return []
        const data = await res.json()
        return (data.results || []).map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.content,
        }))
    } catch (error) {
        console.error('Tavily search error:', error)
        return []
    }
}

const RESEARCH_PROMPT = (text: string, searchData: string, categoryHint: string) => `
You are a "Smart Chef" with extensive F&B and kitchen knowledge. The user wants to fill a restaurant menu form for: "${text}".

${searchData ? `I found some research data online about this dish:\n${searchData}\n` : ''}
${categoryHint}

Your task is to provide a complete, high-quality restaurant-grade recipe and menu details.

GUIDELINES:
1. name: Exact dish name.
2. description: High-quality sensory menu description (max 18 words). Focus on taste, texture, and appeal.
3. price: Calculate a realistic selling price in IQD. 
   - CATEGORIZATION: Decide if this is a "FOOD" item or a "DRINK" item.
   - FOOD LOGIC: Price = (Estimated Direct Cost per serving) / 0.75 (Aim for 25% margin on selling price).
   - DRINK LOGIC: Price = (Estimated Direct Cost per serving) / 0.85 (Aim for 15% margin on selling price).
   - If user provided a price, still validate it against this logic in your "tips".
4. recipeYield: Number of servings (default to a standard batch like 4 or 6, or 1 for individual items).
5. recipeSteps: Detailed SOP steps for a commercial kitchen.
6. recipeTips: Pro tips for plating, consistency, and margin advice.
7. ingredients: Detailed list with {name, quantity, unit, pieceCount}. Use metric units (kg, g, L, ml) or standard kitchen units (cup, tsp, tbsp). 
   - quantity should be for the WHOLE recipe (yield).

RELIABILITY RULES:
- Use kg/g for solids, L/ml for liquids.
- Spices in tsp/tbsp.
- Estimated prepTime and cookTime should be realistic for a restaurant.

Return ONLY valid JSON in this exact shape:
{
  "name": "...",
  "description": "...",
  "price": 12000,
  "categoryName": "...",
  "calories": 450,
  "protein": 25,
  "carbs": 40,
  "tags": ["...", "..."],
  "recipeSteps": ["...", "..."],
  "recipeTips": ["...", "..."],
  "prepTime": "15 min",
  "cookTime": "30 min",
  "recipeYield": 4,
  "ingredients": [{"name": "...", "quantity": 0.5, "unit": "kg", "pieceCount": null}]
}
`

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        const categoryNames = Array.isArray(body.categoryNames) ? body.categoryNames : []
        const attachments = Array.isArray(body.attachments) ? body.attachments : []

        if (!text && attachments.length === 0) {
            return NextResponse.json({ error: 'Text or attachments are required' }, { status: 400 })
        }

        // 1. Search for data if it looks like a simple name or sparse info
        let searchData = ''
        if (text.length > 0 && text.length < 50 && attachments.length === 0) {
            const results = await searchTavily(text)
            searchData = results.map(r => `Source: ${r.title}\n${r.content}`).join('\n\n')
        }

        const categoryHint = categoryNames.length > 0
            ? `Available categories: ${categoryNames.join(', ')}.`
            : 'Suggest a category like Main Course, Appetizer, etc.'

        const finalPrompt = RESEARCH_PROMPT(text, searchData, categoryHint)

        let resultJson: any

        const googleKey = process.env.GOOGLE_AI_KEY
        try {
            if (googleKey) {
                const genAI = new GoogleGenerativeAI(googleKey)
                const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

                const parts: any[] = [{ text: finalPrompt }]
                if (attachments.length > 0) {
                    for (const attachment of attachments) {
                        if (attachment.type.startsWith('image/') || attachment.type === 'application/pdf') {
                            parts.push({
                                inlineData: {
                                    mimeType: attachment.type,
                                    data: attachment.base64
                                }
                            })
                        } else {
                            parts[0].text += `\nDocument name: ${attachment.name}`
                        }
                    }
                }

                const res = await model.generateContent(parts)
                const rawText = res.response.text()
                const match = rawText.match(/\{[\s\S]*\}/)
                resultJson = JSON.parse(match ? match[0] : rawText)
            } else {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: finalPrompt }],
                    response_format: { type: 'json_object' }
                })
                resultJson = JSON.parse(completion.choices[0]?.message?.content || '{}')
            }
        } catch (parseErr) {
            console.error('Failed to parse AI response as JSON:', parseErr)
            throw new Error('The AI provided a response that could not be parsed. Please try again.')
        }

        return NextResponse.json(resultJson)
    } catch (error) {
        console.error('Research API error:', error)
        return NextResponse.json({ error: 'Failed to research recipe' }, { status: 500 })
    }
}
