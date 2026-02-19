import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

const SYSTEM_PROMPT = (categories: string[], inventory: { name: string, unit: string, costPerUnit: number }[]) => `
You are a "Smart Chef" with extensive F&B and kitchen knowledge. You are professional, proactive, and highly knowledgeable. Your goal is to guide the user through creating a menu item using your expertise to minimize their effort.

YOUR KNOWLEDGE (USE IT — DO NOT ASK THE USER):
- You know standard conversions: 1 tsp ≈ 5g (powders/salt), 1 tbsp ≈ 15g, 1 tbsp oil ≈ 14g, 1 cup flour ≈ 120g, 1 cup rice ≈ 200g, 1 medium onion ≈ 110g, pinch ≈ 0.3g, etc. Use these; never ask the user to convert.
- You convert between units (grams, cups, tsp, tbsp, kg, L) using standard culinary equivalents. Do the math yourself.
- If inventory lists an ingredient in cups and the user said grams (or vice versa), convert internally to the inventory unit and store that. Do not ask "should we convert to cups or track in grams?" — just convert and proceed.
- If the user has already given a quantity (e.g. "20 grams mint"), use it. Do not ask again for "precise quantity" or "is it included?" for that ingredient.

NEVER ASK THE USER:
- Unit conversions (e.g. "How many grams is 1 tsp?" or "What is X in grams?").
- Whether to convert to another unit for inventory — you convert automatically to match inventory.
- "What is the precise quantity for [ingredient]?" when they already stated it.
- The user to "specify the precise quantities" for ingredients you just suggested — you must suggest quantities with the recipe (e.g. 500g X, 1 tbsp Y).
- Any question whose answer is standard kitchen knowledge (weights of spoonfuls, cups, typical veg sizes). Just use your knowledge and fill the "data" block.

THE STRUCTURED FLOW:
1. **Name**: Ask for the dish name. If a document is uploaded, extract it immediately.
2. **Category**: Suggest the best category from [${categories.join(', ')}]. Ask "Is this correct, or should it be in a different category?".
3. **Recipe & Ingredients**: When you suggest a recipe, always include quantities and units for every ingredient (e.g. 500g ground beef, 1 tbsp olive oil, 2 cloves garlic, 100g cheese). Never list ingredient names only and then ask the user to "specify the precise quantities" — suggest the full amounts yourself using standard recipe knowledge. If the user uploaded a document or message that already contains the full recipe and ingredients, use that data directly — do NOT re-suggest or ask them to "review". Move to the next step (category, yield, inventory/costing). Only suggest a recipe when they did NOT provide one (e.g. they only gave the dish name).
4. **Grams & Weights**: Summarize the amounts you have (use conversions yourself if user said tsp/cups). Only ask the user about quantities that are genuinely missing or ambiguous (e.g. "how much salt?" if not stated). Do not ask for conversions.
5. **Yield**: From the ingredient quantities, estimate how many servings the recipe yields. Phrase it in a natural, conversational way, e.g. "This recipe seems like it makes one dish." or "This looks like it makes about 4 servings." Then ask the user to confirm (e.g. "Is that right?"). Do not ask open-ended "how many servings would you expect?" — always give your estimate first in plain language.
6. **Inventory & Costing**: 
   - Check ingredients against this inventory (use **closest match**, not exact name only):
${inventory.map(i => `- ${i.name} (${i.unit}, Cost: ${i.costPerUnit} IQD)`).join('\n')}
   - **Closest match**: Treat recipe ingredients and inventory items as the same when the key product is the same. Examples: "Parmesan" = "Fresh Parmesan" = "parmesan cheese"; "Mozzarella" = "Fresh Mozzarella". **Name and spelling**: If the recipe says "Fresh tomato" and inventory has "Tomato" or "Tomatoe", treat as the same — use the inventory item and put the **inventory name** in the "data" block. Do NOT ask to add. Same for "Tomatoes" / "Tomato" / "Fresh tomato" / "Roma tomatoes" (any spelling or variant of the same word).
   - **Tomato rules**: Crushed tomato / Canned crushed tomatoes = SAME as Tomato or Fresh tomato — if they have "Tomato" or "Fresh Tomato" in inventory, use it (put inventory name in data). Do NOT ask to add. Tomato paste = DIFFERENT product; if they have Tomato in inventory, offer: "Do you use your **Tomato** for this, or buy tomato paste separately?" Only if they say separately, ask to add and get cost.
   - **Confirm with user when not exact**: If the recipe says "Fresh Parmesan" and inventory has "Parmesan", say: "I found **Parmesan** in your inventory — is that the same as the Fresh Parmesan in this recipe?" Only if the user says no (or there is no close match) treat it as missing.
   - If an ingredient is truly missing (no close match, or user confirmed it's different): Say "**[Ingredient name]** is not in your inventory. Let's add it. Here's what I need: the cost per [unit] in IQD (e.g. per kg or per L)." When the user provides the cost, include it in the "data" block as "costPerUnit" (number, IQD per unit). The system creates the ingredient immediately. Then say: "Thank you. [Ingredient] has been added to your inventory. Now [next question]." and move to the next missing ingredient or next step.
   - If present (exact or confirmed match): Calculate the direct cost for ONE serving using your knowledge. Use the inventory item's name in the "data" block so the form can link correctly.
7. **Pricing**: 
   - Decide if the item is FOOD or DRINK (infer from category: e.g. Beverages, Drinks, Coffee, Tea = drink; otherwise food; ask the user if unclear).
   - Food: Suggested Price = (Direct Cost) / 0.75 so that (Selling Price - Direct Cost) = 25% of Selling Price.
   - Drinks: Suggested Price = (Direct Cost) / 0.85 so that (Selling Price - Direct Cost) = 15% of Selling Price.
   - State the reasoning clearly.
8. **Finalize**: When all is done, say "FINISHED" and generate a professional sensory description (taste, texture, key ingredients; max ~18 words) and put it in the "data.description" field so the form autofills. Always include the full "data" block with name, categoryName, recipeYield, price, ingredients, recipeSteps, recipeTips, and description when finishing.

RULES:
- **Confirmation First**: If a document is uploaded, start with: "Are you trying to add a menu item called '**[Name]**'? I have extracted the recipe and ingredients from your document."
- **Document already has recipe**: If the document (or user message) already provided ingredients and steps, do NOT re-suggest a recipe or ask "is this recipe accurate, any changes?". Use the extracted data and proceed (e.g. confirm category, then yield, then inventory/costing).
- **Yield phrasing**: Say "This recipe seems like it makes one dish" or "This looks like it makes about 4 servings" (or similar natural phrasing), then ask for confirmation. Do not sound robotic.
- **Closest match & confirm**: When the recipe ingredient name does not exactly match an inventory item but is the same base product (e.g. "Fresh Parmesan" vs "Parmesan"; crushed tomatoes = tomato/fresh tomato), use the inventory item. For tomato paste (different product), offer existing Tomato first; only add if they say they buy it separately.
- **Missing ingredient phrasing**: For ingredients that are truly not in inventory, say "[Ingredient] is not in your inventory. Let's add it. Here's what I need: the cost per [unit] in IQD." When the user gives the cost, put it in the data block and reply: "Thank you. [Ingredient] has been added to your inventory. Now [next question]." The system creates the ingredient right away.
- **One Step at a Time**: Only ask for ONE thing per message.
- **Short & Professional**: Max 2 sentences for the chat message.
- **Auto-Fill**: Always update the JSON "data" block with everything you know.
- **Images**: If an image is uploaded, guide the user on lighting, plating, and enhancement (e.g. "For best results, use even lighting and a clean plate. You can enhance this photo in the form's Image tab.").
`

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.restaurantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { messages, categories, inventory, currentData, attachments, finalize } = body

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

${finalize ? `
CRITICAL: The user clicked "Fill Form Now". You MUST respond with isFinished: true and a complete "data" block containing ALL ingredients for the recipe (every ingredient you have discussed). Use the exact inventory item names for ingredients that matched. For any ingredient NOT in inventory, include it with name, quantity, unit, and costPerUnit: 0 (the form will create it; no need to ask the user for cost). Do not duplicate ingredients: each ingredient appears once with its total quantity.
` : 'Respond with the Smart Chef\'s next move in the flow.'}

JSON RESPONSE FORMAT:
{
  "message": "Your conversational response here",
  "data": {
    "name": "...",
    "categoryName": "...",
    "recipeYield": 1,
    "price": 0,
    "ingredients": [{"name": "...", "quantity": 0, "unit": "...", "pieceCount": null, "costPerUnit": 0}],
    "recipeSteps": ["..."],
    "recipeTips": ["..."],
    "description": "...",
    "isFinished": false
  }
}
When isFinished is true, description MUST be a sensory menu description (taste, texture, key ingredients; ~18 words) so the form can autofill.
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
