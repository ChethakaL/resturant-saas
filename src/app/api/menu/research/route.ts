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

const RESEARCH_PROMPT = (text: string, searchData: string, categoryHint: string, dishNameLock?: string) => `
You are a "Smart Chef" assistant focused on professional F&B management. You are tasked with gathering and structuring data for the following item: "${text}".
${dishNameLock ? `\nCRITICAL: The user is adding exactly this dish: **${dishNameLock}**. You MUST return name, description, and recipe for this dish only. Do NOT return a different dish (e.g. if the user said lasagna, do NOT return shawarma or any other dish). The "name" field in your JSON must be "${dishNameLock}" or a standard spelling of it.\n` : ''}

TONE: Professional, succinct, and clinical. Avoid marketing fluff or excitement. Do not use Markdown headers (e.g. # or ##). Use bold text (**) for emphasis.

${searchData ? `I found some research data online about this dish:\n${searchData}\n` : ''}
${categoryHint}

Your task is to provide a complete, technical restaurant-grade recipe and menu details.

GUIDELINES:
0. LANGUAGE: ALL JSON output values MUST be in ENGLISH, even if the user requests the dish using Arabic or another language.
1. name: Exact dish name in English.
2. description: Professional sensory menu description (max 18 words) in English. Focus on key ingredients and taste profile.
3. price: Calculate a realistic selling price in IQD. 
   - CATEGORIZATION: Decide if this is a "FOOD" item or a "DRINK" item.
   - FOOD LOGIC: Price = (Estimated Direct Cost per serving) / 0.75 (Target: 25% margin on selling price).
   - DRINK LOGIC: Price = (Estimated Direct Cost per serving) / 0.85 (Target: 15% margin on selling price).
   - If user provided a price, still validate it against this logic in your "tips".
4. recipeYield: Number of servings (default to a standard batch like 4 or 6, or 1 for individual items).
5. recipeSteps: Detailed SOP steps for a commercial kitchen.
6. recipeTips: Technical tips for plating, consistency, and margin management.
7. ingredients: Detailed list with {name, quantity, unit, pieceCount}. Use metric units (kg, g, L, ml) or standard kitchen units (cup, tsp, tbsp). 
   - quantity should be for the WHOLE recipe (yield).

RELIABILITY RULES:
- Use kg/g for solids, L/ml for liquids.
- Spices in tsp/tbsp.
- Estimated prepTime and cookTime should be realistic for a commercial service environment.

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
        const dishName = typeof body.dishName === 'string' ? body.dishName.trim() : ''
        const categoryNames = Array.isArray(body.categoryNames) ? body.categoryNames : []
        const attachments = Array.isArray(body.attachments) ? body.attachments : []

        if (!text && attachments.length === 0) {
            return NextResponse.json({ error: 'Text or attachments are required' }, { status: 400 })
        }

        // Use dish name for search and prompt lock so we don't return a different dish (e.g. lasagna -> shawarma)
        const searchQuery = dishName || text.split(/\n/)[0]?.trim() || text
        const dishNameLock = dishName || (searchQuery.length <= 50 ? searchQuery : '')

        // 1. Search for data using the specific dish name
        let searchData = ''
        if (searchQuery.length > 0 && searchQuery.length <= 80 && attachments.length === 0) {
            const results = await searchTavily(searchQuery)
            searchData = results.map(r => `Source: ${r.title}\n${r.content}`).join('\n\n')
        }

        const categoryHint = categoryNames.length > 0
            ? `Available categories: ${categoryNames.join(', ')}.`
            : 'Suggest a category like Main Course, Appetizer, etc.'

        const finalPrompt = RESEARCH_PROMPT(text, searchData, categoryHint, dishNameLock)

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

        // Ensure we don't return a different dish than the user asked for (e.g. lasagna -> shawarma)
        if (dishNameLock && resultJson && typeof resultJson === 'object') {
            const returnedName = (resultJson.name || '').trim().toLowerCase()
            const lockLower = dishNameLock.trim().toLowerCase()
            const isSameDish = returnedName === lockLower || returnedName.includes(lockLower) || lockLower.includes(returnedName)
            if (!isSameDish) {
                resultJson.name = dishNameLock
            }
        }

        return NextResponse.json(resultJson)
    } catch (error) {
        console.error('Research API error:', error)
        return NextResponse.json({ error: 'Failed to research recipe' }, { status: 500 })
    }
}
