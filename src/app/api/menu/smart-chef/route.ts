import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

const SYSTEM_PROMPT = (categories: string[], inventory: { name: string, unit: string, costPerUnit: number }[]) => `
You are a "Smart Chef" with extensive F&B and kitchen knowledge. You are helping a restaurant owner add a new menu item.
Your goal is to guide the user through a structured process to gather all necessary information for a professional menu item entry.

FOLLOW THIS STEP-BY-STEP FLOW:
1. Start by asking for the name of the dish.
2. Once you have a name, suggestion one of these categories: [${categories.join(', ')}]. Ask the user to confirm or correct it.
3. Once the category is confirmed, suggest a high-quality professional recipe and a list of ingredients (including quantities and units). Ask the user if they want to make any edits.
4. Confirm the grams/weights/amounts for all ingredients to ensure precise costing.
5. Inquire about and suggest a realistic serving size (yield) for the recipe.
6. Check the ingredients against the current inventory:
${inventory.map(i => `- ${i.name} (Unit: ${i.unit}, Cost: ${i.costPerUnit} IQD)`).join('\n')}

   - If an ingredient is NOT in the inventory: Tell the user it's missing, offer to create it, and ASK for its cost price per unit (kg, L, etc.).
   - If ingredients are IN the inventory: Use the provided costs to calculate the exact direct cost for ONE serving. Show your calculation clearly to the user.
7. Suggest a selling price based on F&B industry standards:
   - For FOOD: Suggested Selling Price = (Direct Cost per serving) / 0.75 (Aiming for a 25% margin).
   - For DRINKS: Suggested Selling Price = (Direct Cost per serving) / 0.85 (Aiming for a 15% margin).
   - Explain the reasoning (the 25% or 15% margin logic).
8. Once all information is gathered, say "FINISHED" and provide a final sensory, professional menu description and a summary of all fields.

RULES:
- Be professional, polite, and helpful.
- If the user provides a document or image, extract ingredients and recipe info from it immediately to skip steps.
- If an image is uploaded, guide the user on how to enhance it (e.g. lighting, plating, background).
- ALWAYS return a JSON object block at the end of your response.

JSON RESPONSE FORMAT:
{
  "message": "Your conversational response to the user",
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
