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
6. **Inventory & Costing** (you MUST go through every recipe ingredient — do not skip any, including salt, flour, baking powder, etc.):
   - Inventory list:
${inventory.map(i => `- ${i.name} (${i.unit}, Cost: ${i.costPerUnit} IQD)`).join('\n')}
   - **Unit cost** means: the price you pay per unit (e.g. per kg, per L, per g) in IQD. When an ingredient is not in inventory, we need this to calculate recipe cost.
   - **Exact or spelling match**: Same product, different spelling — e.g. "Tomato" / "Tomatoe" / "Fresh tomato" / "Roma tomatoes". Use the inventory name in the "data" block. Do not ask to add.
   - **Tomato rules**: Crushed tomato / Canned crushed tomatoes = SAME as Tomato or Fresh tomato — use inventory name. Tomato paste = DIFFERENT; if they have Tomato, ask: "Do you use your **Tomato** for this, or buy tomato paste separately?" Only if separately, ask to add and get cost.
   - **Same base product, different variant (IMPORTANT)**: When the recipe uses a more specific name and inventory has a broader item, do NOT auto-match. You MUST ask the user. Examples: recipe says "all-purpose flour", inventory has "flour" → ask: "In your inventory you have **flour**. The recipe uses **all-purpose flour**. Do you want to use **flour** for this, or add **all-purpose flour** as a separate inventory item?" Recipe says "kosher salt", inventory has "Salt" → ask the same (use Salt or add kosher salt as separate). Only after the user answers, use the inventory name or add the new ingredient and ask for cost per unit.
   - **Confirm when not exact (same product)**: If recipe says "Fresh Parmesan" and inventory has "Parmesan", say: "I found **Parmesan** in your inventory — is that the same as the Fresh Parmesan in this recipe?" Only if they say no (or no close match) treat as missing.
   - **Not in inventory**: For each ingredient that has no match (or user said "add as separate"), say clearly: "**[Ingredient name]** is not in your inventory. Let's add it. What is the cost per [unit] in IQD (e.g. per kg or per L)?" When the user gives the cost, put it in the "data" block as costPerUnit. The system creates the ingredient. Then: "Thank you. [Ingredient] has been added. Now [next ingredient or step]."
   - **During the conversation**: Go through each ingredient one by one when you can — match to inventory (with variant question when relevant) or say it is not in inventory and ask for unit cost. If the user clicks "Fill Form Now" before every ingredient was discussed, include those ingredients with costPerUnit: 0; the form will show cost incomplete and the user can use the "Cost complete" button to add pricing later.
   - If present (exact or confirmed match): Use the inventory item's name in the "data" block so the form can link correctly and cost is known.
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
- **Yield prerequisite (STRICT)**: Never ask about servings/yield until you have at least one concrete ingredient with quantity/unit in data.ingredients (from user text, attachment, or your suggested recipe).
- **Flour / salt / variant rule**: When recipe has "all-purpose flour" and inventory has "flour" (or "kosher salt" vs "Salt", etc.), always ask: "In your inventory you have **flour**. The recipe uses **all-purpose flour**. Do you want to use **flour** for this, or add **all-purpose flour** as a separate inventory item?" Do not assume they are the same without asking.
- **Missing ingredient (during chat)**: When an ingredient is not in inventory, say "[Ingredient] is not in your inventory. Let's add it. What is the cost per [unit] in IQD?" so the user can provide unit cost. When the user clicks "Fill Form Now" before all ingredients were discussed, include any remaining ones with costPerUnit: 0 — the form shows cost incomplete and the user can complete pricing via the Cost complete button.
- **One Step at a Time**: Only ask for ONE thing per message (one ingredient, one confirmation, or one cost).
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
CRITICAL: The user clicked "Fill Form Now". Respond with isFinished: true and a complete "data" block with ALL recipe ingredients. Use the exact inventory item names for ingredients that were matched or confirmed. For any ingredient that was not discussed or has no cost yet, include it with name, quantity, unit, and costPerUnit: 0. The form will show cost incomplete for those, and the user can use the "Cost complete" button to add pricing. In your "message" you may briefly mention which items have cost 0 if any. Do not duplicate ingredients: each appears once with its total quantity.
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

        const requestDebugId = `smart-chef-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

        // Guardrail: do not allow yield/servings questions before recipe ingredients exist.
        // This prevents stale or jumpy flow where the assistant asks servings right after category.
        const currentIngredients = Array.isArray(currentData?.ingredients) ? currentData.ingredients : []
        const responseIngredients = Array.isArray(responseData?.data?.ingredients) ? responseData.data.ingredients : []
        const hasKnownIngredients =
          [...currentIngredients, ...responseIngredients].some((ing: any) => {
            const hasName = typeof ing?.name === 'string' && ing.name.trim().length > 0
            const hasLinkedIngredient = typeof ing?.ingredientId === 'string' && ing.ingredientId.trim().length > 0
            const hasQty = typeof ing?.quantity === 'number' && ing.quantity > 0
            return (hasName || hasLinkedIngredient) && hasQty
          })

        const userMessages = (Array.isArray(messages) ? messages : []).filter((m: any) => m?.role === 'user')
        const lastUserText = String(userMessages[userMessages.length - 1]?.text || '').trim()
        const recentAssistantText = (Array.isArray(messages) ? messages : [])
          .slice(-5)
          .filter((m: any) => m?.role === 'assistant')
          .map((m: any) => String(m?.text || ''))
          .join(' ')
          .toLowerCase()
        const lastUserConfirmedCategory = /^(yes|yeah|yep|correct|right|ok|okay|sure|sounds good|exactly)\b/i.test(lastUserText)
        const assistantAskedCategoryRecently =
          recentAssistantText.includes('different category') ||
          recentAssistantText.includes('is this correct') ||
          recentAssistantText.includes('category')
        const userProvidedRecipeSignals = userMessages.some((m: any) =>
          /\b(recipe|ingredients?)\b/i.test(String(m?.text || '')) ||
          /\b\d+(\.\d+)?\s?(g|gram|grams|kg|ml|l|liter|litre|cup|cups|tbsp|tsp|teaspoon|tablespoon|oz|ounce|lb|clove|cloves|pinch|piece|pieces)\b/i.test(String(m?.text || ''))
        )
        const hasRecipeContext =
          hasKnownIngredients ||
          (Array.isArray(attachments) && attachments.length > 0) ||
          userProvidedRecipeSignals

        const messageText = String(responseData?.message || '')
        const lowerMsg = messageText.toLowerCase()
        const asksYield =
          lowerMsg.includes('servings') ||
          lowerMsg.includes('recipe yield') ||
          (lowerMsg.includes('is that right?') && lowerMsg.includes('recipe'))

        const ingredientPreview = [...currentIngredients, ...responseIngredients]
          .slice(0, 8)
          .map((ing: any) => ({
            name: ing?.name ?? null,
            ingredientId: ing?.ingredientId ?? null,
            quantity: typeof ing?.quantity === 'number' ? ing.quantity : null,
            unit: ing?.unit ?? null,
          }))

        console.info('[smart-chef][yield-check]', {
          debugId: requestDebugId,
          finalize: !!finalize,
          messageCount: Array.isArray(messages) ? messages.length : 0,
          asksYield,
          hasKnownIngredients,
          hasRecipeContext,
          lastUserConfirmedCategory,
          assistantAskedCategoryRecently,
          currentIngredientsCount: currentIngredients.length,
          responseIngredientsCount: responseIngredients.length,
          ingredientPreview,
          aiMessagePreview: messageText.slice(0, 220),
        })

        // Guardrail: after category confirmation, do not auto-invent recipe/yield unless recipe context exists.
        if (
          !finalize &&
          !hasRecipeContext &&
          lastUserConfirmedCategory &&
          assistantAskedCategoryRecently &&
          (asksYield || responseIngredients.length > 0 || Number(responseData?.data?.recipeYield || 0) > 0)
        ) {
            console.warn('[smart-chef][category-to-recipe-guard-triggered]', {
              debugId: requestDebugId,
              reason: 'No recipe context, but AI attempted recipe/yield immediately after category confirmation',
            })
            responseData.message =
              'Great, category confirmed. Would you like me to suggest a standard recipe for this dish, or will you provide your own recipe ingredients?'
            responseData.data = {
              ...(responseData.data || {}),
              ingredients: [],
              recipeSteps: [],
              recipeTips: [],
              recipeYield: 0,
              isFinished: false,
            }
        }

        if (asksYield && !hasKnownIngredients) {
            console.warn('[smart-chef][yield-guard-triggered]', {
              debugId: requestDebugId,
              reason: 'AI asked servings/yield before ingredients were known',
            })
            responseData.message =
              'Great, category confirmed. Please share the recipe ingredients with quantities (or upload the recipe), then I will estimate servings.'
            responseData.data = {
              ...(responseData.data || {}),
              isFinished: false,
            }
        }

        return NextResponse.json(responseData)

    } catch (error) {
        console.error('Smart Chef API error:', error)
        return NextResponse.json({ error: 'Smart Chef encountered an error' }, { status: 500 })
    }
}
