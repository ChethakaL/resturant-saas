import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

const SYSTEM_PROMPT = (categories: string[], inventory: { name: string, unit: string, costPerUnit: number }[]) => `
You are a "Smart Chef" assistant focused on professional F&B management. Your goal is to gather data to add a new menu item.

CONVERSATIONAL RULES (STRICT):
1. ONE STEP AT A TIME: Only ask for ONE piece of information per message. Never dump all steps at once.
2. BREVITY: Keep every response extremely short (max 2-3 sentences). No walls of text. No data dumps.
3. NO HEADERS: Do not use Markdown headers (e.g., # or ##). Use bold text (**word**) for emphasis only.
4. DIRECTNESS: Be professional, clinical, and direct. No conversational fluff or enthusiasm.

THE SEQUENTIAL FLOW (DO NOT SKIP):
1. **Name**: Identify the menu item name.
2. **Category**: Suggest a category from: [${categories.join(', ')}].
3. **Recipe & Ingredients**: Suggest a base recipe and ingredients. Ask for confirmation or edits.
4. **Weights/Measures**: Confirm precise quantities for all ingredients.
5. **Yield**: Confirm the recipe yield (number of servings).
6. **Inventory Costing**: Verify costs for missing ingredients or state costs for existing ones.
   Inventory data for reference:
${inventory.map(i => `- ${i.name} (${i.unit})`).join('\n')}
7. **Pricing**: Recommend a selling price based on 25% margin (Food) or 15% margin (Drinks).
8. **Finalize**: Output "FINISHED" only when all data is complete.

MANDATORY: If the user provides info for multiple steps (via text or attachment), you can process them all, but your "message" must still be a single, short follow-up for the NEXT missing piece of data.
`

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { messages, categories, inventory, currentData, attachments } = body

        const googleKey = process.env.GOOGLE_AI_KEY
        if (!googleKey) {
            return NextResponse.json({ error: 'Google AI key not configured' }, { status: 500 })
        }

        const genAI = new GoogleGenerativeAI(googleKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

        const prompt = `
${SYSTEM_PROMPT(categories, inventory)}

Current Form Data State: ${JSON.stringify(currentData)}

Conversation History:
${messages.map((m: any) => `${m.role.toUpperCase()}: ${m.text}`).join('\n')}

${attachments && attachments.length > 0 ? `The user has attached ${attachments.length} files (documents or images). Extract any recipe, ingredient, or plating info from them.` : ''}

Respond with the Smart Chef's next move in the flow.

JSON RESPONSE FORMAT:
{
  "message": "Your conversational response here",
  "data": {
    "name": "...",
    "categoryName": "...",
    "recipeYield": 1,
    "price": 0,
    "ingredients": [{"name": "...", "quantity": 0, "unit": "..."}],
    "recipeSteps": ["..."],
    "recipeTips": ["..."],
    "description": "...",
    "isFinished": false
  }
}
`
        // Handle attachments (images) for Gemini multimodal
        const parts: any[] = [{ text: prompt }]

        if (attachments && attachments.length > 0) {
            for (const attachment of attachments) {
                if (attachment.type.startsWith('image/') || attachment.type === 'application/pdf') {
                    parts.push({
                        inlineData: {
                            mimeType: attachment.type,
                            data: attachment.base64
                        }
                    })
                } else {
                    // For other text files, we still note their names
                    parts[0].text += `\nDocument attached: ${attachment.name}`
                }
            }
        }

        const result = await model.generateContent(parts)
        const rawText = result.response.text()

        // Extract JSON from the response
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            return NextResponse.json({
                message: rawText,
                data: currentData || {}
            })
        }

        const responseData = JSON.parse(jsonMatch[0])
        return NextResponse.json(responseData)

    } catch (error) {
        console.error('Smart Chef API error:', error)
        return NextResponse.json({ error: 'Smart Chef encountered an error' }, { status: 500 })
    }
}
