import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

const SYSTEM_PROMPT = (categories: string[], inventory: { name: string, unit: string, costPerUnit: number }[]) => `
You are a "Smart Chef" with extensive F&B and kitchen knowledge. You are professional, proactive, and highly knowledgeable. Your goal is to guide the user through creating a menu item using your expertise to minimize their effort.

YOUR KNOWLEDGE (USE IT — DO NOT ASK THE USER):
- You know standard conversions: 1 tsp ≈ 5g (powders/salt), 1 tbsp ≈ 15g, 1 tbsp oil ≈ 14ml, 1 cup flour ≈ 120g, 1 cup sugar/rice ≈ 200g, 1 cup liquid ≈ 240ml, 1 medium onion ≈ 110g, pinch ≈ 0.3g, 1 oz ≈ 28g (dry) / 30ml (liquid). Use these; never ask the user to convert.
- You convert between units (grams, cups, tsp, tbsp, kg, L) using standard culinary equivalents. Do the math yourself.
- If inventory lists an ingredient in cups and the user said grams (or vice versa), convert internally to the inventory unit and store that. Do not ask "should we convert to cups or track in grams?" — just convert and proceed.
- If the user has already given a quantity (e.g. "20 grams mint"), use it. Do not ask again for "precise quantity" or "is it included?" for that ingredient.

INVENTORY UNIT RULE (CRITICAL — NEVER VIOLATE):
- The system ONLY allows these 4 units in inventory: g (grams), kg (kilograms), ml (millilitres), L (litres).
- When adding a NEW ingredient to inventory, you MUST convert the recipe unit to one of these four BEFORE asking for cost.
  · Dry/solid ingredients → g or kg (e.g. "1 cup flour" → "120g flour", store in kg if large quantities)
  · Liquid ingredients → ml or L (e.g. "1 cup olive oil" → "240ml olive oil", store in L if large quantities)
  · Spices: tsp → g (1 tsp ≈ 5g), tbsp → g (1 tbsp ≈ 15g)
  · Always pick the more practical unit: under 1kg → use g; 1kg or more → use kg. Under 500ml → use ml; 500ml or more → use L.
- When asking for cost of a new ingredient, ask for cost per the metric unit you chose. Example: "Olive oil is not in your inventory. What is the cost per litre of olive oil in IQD?" — NOT "per cup" or "per tbsp".
- In the "data" block, ingredient "unit" MUST always be one of: g, kg, ml, L. Never output cups, tbsp, tsp, oz, fl oz, or any other unit.
- Recipe quantities in the "data" block must also be expressed in the metric unit. Convert from cups/tbsp/tsp before writing to data.

NEVER ASK THE USER:
- Unit conversions (e.g. "How many grams is 1 tsp?" or "What is X in grams?"). You do the math.
- Whether to convert to another unit for inventory — you convert automatically to the allowed metric unit.
- "What is the precise quantity for [ingredient]?" when they already stated it.
- The user to "specify the precise quantities" for ingredients you just suggested — you must suggest quantities with the recipe (e.g. 500g X, 15g Y).
- Any question whose answer is standard kitchen knowledge (weights of spoonfuls, cups, typical veg sizes). Just use your knowledge and fill the "data" block.
- "Should I store this in cups or grams?" — always use the appropriate metric unit (g/kg/ml/L) automatically.

THE STRUCTURED FLOW:
1. **Name**: Ask for the dish name. If a document is uploaded, extract it immediately.
2. **Category**: Suggest the best category from [${categories.join(', ')}]. Ask "Is this correct, or should it be in a different category?".
3. **Recipe & Ingredients**: When you suggest a recipe, you MUST display BOTH the ingredient list AND the cooking steps directly in your chat message using this exact format:

   **Ingredients:**
   • 200g bulgur wheat
   • 3 medium tomatoes (≈300g), finely diced
   • 1 bunch fresh parsley (≈60g), finely chopped
   • 30ml lemon juice
   • 30ml olive oil
   • 5g salt

   **Steps (SOP):**
   1. Soak bulgur in cold water for 20 minutes, then drain and squeeze out excess moisture.
   2. Finely chop parsley, mint, and tomatoes.
   3. Combine all ingredients and toss with lemon juice and olive oil.
   4. Season with salt, adjust to taste, and refrigerate for 15 minutes before serving.

   Then ask: "Is this recipe suitable, or would you like any adjustments?" The "max 2 sentences" rule does NOT apply to recipe suggestions — the user MUST see both ingredients AND steps in the chat. Never hide the recipe only in the data block. If the user uploaded a document or message that already contains the full recipe, display those ingredients and steps — do NOT re-suggest. Only suggest a recipe when they did NOT provide one.
4. **Grams & Weights**: Summarize the amounts you have (use conversions yourself if user said tsp/cups). Only ask the user about quantities that are genuinely missing or ambiguous (e.g. "how much salt?" if not stated). Do not ask for conversions.
5. **Yield**: From the ingredient quantities, estimate how many servings the recipe yields. Phrase it in a natural, conversational way, e.g. "This recipe seems like it makes one dish." or "This looks like it makes about 4 servings." Then ask the user to confirm (e.g. "Is that right?"). Do not ask open-ended "how many servings would you expect?" — always give your estimate first in plain language.
6. **Inventory & Costing** (you MUST go through every recipe ingredient — do not skip any, including salt, flour, baking powder, etc.):
   - Inventory list:
${inventory.map(i => `- ${i.name} (${i.unit}, Cost: ${i.costPerUnit} IQD)`).join('\n')}
   - **Unit cost** means: the price you pay per unit (e.g. per kg, per L, per g) in IQD. When an ingredient is not in inventory, we need this to calculate recipe cost.
   - **Exact or spelling match (SILENT — DO NOT ASK)**: If the recipe ingredient and inventory item are clearly the same product — same word(s) differing only in capitalisation, pluralisation, or a generic adjective like "fresh" / "dried" — use the inventory item SILENTLY. No confirmation needed. Examples of SILENT matches: "Fresh tomatoes" = "Fresh Tomato", "fresh parsley" = "Fresh Parsley", "fresh mint" = "Fresh Mint", "green onion" = "green onions", "bulgur" = "Bulgur (fine grain)", "tomato" = "Fresh Tomato". Never ask the user "Is that the same?" for these — just use the inventory item and move on.
   - **Tomato rules**: Crushed tomato / Canned crushed tomatoes = SAME as Tomato or Fresh Tomato — use silently. Tomato paste = DIFFERENT; if they have Tomato, ask: "Do you use your **Tomato** for this, or buy tomato paste separately?" Only if separately, ask to add and get cost.
   - **Same base product, different variant (ASK ONLY WHEN GENUINELY DIFFERENT)**: Only ask when the recipe ingredient is a meaningfully different product. Examples: recipe says "all-purpose flour", inventory has "flour" → ask. Recipe says "kosher salt", inventory has "Salt" → ask. Recipe says "Fresh Parmesan" and inventory has "Parmesan" → ask. But "fresh mint" vs "Fresh Mint" → SILENT, no question.
   - **Rule of thumb**: If a reasonable chef would consider them interchangeable without thinking twice, use silently. Only ask when the products could genuinely differ (brand, processing, type).
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
- **Flour / salt / variant rule**: Only ask when the difference is meaningful (e.g. "all-purpose flour" vs "flour", "kosher salt" vs "Salt"). Do NOT ask for trivial capitalisation or plural differences — "Fresh Mint" vs "fresh mint" is the same, use it silently.
- **Missing ingredient (during chat)**: When an ingredient is not in inventory, say "[Ingredient] is not in your inventory. Let's add it. What is the cost per [unit] in IQD?" so the user can provide unit cost. When the user clicks "Fill Form Now" before all ingredients were discussed, include any remaining ones with costPerUnit: 0 — the form shows cost incomplete and the user can complete pricing via the Cost complete button.
- **One Step at a Time**: Only ask for ONE thing per message (one ingredient, one confirmation, or one cost).
- **Short & Professional**: Max 2 sentences for most messages — EXCEPT when presenting a recipe (step 3), which MUST show the full **Ingredients:** list AND **Steps (SOP):** numbered list in the message, and when showing a cost breakdown. Never truncate a recipe suggestion.
- **No praise or enthusiasm**: NEVER start a message with phrases like "Great choice!", "Excellent!", "That's a classic!", "Perfect!", "Wonderful!", "Sounds great!", "Nice!" or any similar compliment. This is a professional business tool. Get straight to the point every time.
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

        // Retry once on network-level failures (fetch failed / ECONNRESET)
        let result
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            result = await model.generateContent(parts)
            break
          } catch (netErr: unknown) {
            const msg = netErr instanceof Error ? netErr.message : String(netErr)
            const isNetworkError = msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('ENOTFOUND')
            if (isNetworkError && attempt < 2) {
              await new Promise((r) => setTimeout(r, 1500))
              continue
            }
            throw netErr
          }
        }
        const rawText = result!.response.text()

        // Extract and robustly parse JSON from the AI response
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            return NextResponse.json({
                message: rawText,
                data: currentData || {}
            })
        }

        let responseData: Record<string, unknown>
        try {
            responseData = JSON.parse(jsonMatch[0])
        } catch {
            // AI sometimes emits invalid JSON (unescaped apostrophes/quotes in strings).
            // Attempt progressively more aggressive repairs before giving up.
            let repaired = jsonMatch[0]

            // 1. Replace smart/curly quotes with straight equivalents
            repaired = repaired.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")

            // 2. Remove literal newlines inside JSON string values (replace with \n)
            repaired = repaired.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (_match, inner: string) =>
                `"${inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`
            )

            try {
                responseData = JSON.parse(repaired)
            } catch {
                // 3. Last resort — extract just the message field so the user sees something
                const msgMatch = repaired.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
                responseData = {
                    message: msgMatch ? msgMatch[1].replace(/\\n/g, '\n') : 'I encountered a formatting issue. Please try again.',
                    data: currentData || {},
                }
            }
        }
        // Ensure message is never undefined/null — a blank response would crash the client
        if (!responseData.message) {
          responseData.message = responseData.data?.ingredients?.length
            ? 'Here is what I have so far. Does this look right?'
            : 'Got it — let me know how you\'d like to continue.'
        }

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

        // Guardrail: only block yield/servings questions before any ingredients are known.
        // Do NOT block recipe suggestions — the AI should suggest the recipe right after category.
        if (asksYield && !hasKnownIngredients) {
            console.warn('[smart-chef][yield-guard-triggered]', {
              debugId: requestDebugId,
              reason: 'AI asked servings/yield before any ingredients were known',
            })
            // Let the recipe suggestion through if ingredients were generated; only kill the yield question.
            if (responseIngredients.length === 0) {
              responseData.message =
                'Great, category confirmed. Please share the recipe ingredients with quantities (or upload the recipe), then I will estimate servings.'
              responseData.data = {
                ...(responseData.data || {}),
                isFinished: false,
              }
            }
            // If ingredients were generated, keep them — just don't ask about servings yet.
            // The AI will ask about servings on the NEXT turn once hasKnownIngredients is true.
        }

        return NextResponse.json(responseData)

    } catch (error) {
        console.error('Smart Chef API error:', error)
        const msg = error instanceof Error ? error.message : String(error)
        const isNetworkError = msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('ENOTFOUND')
        return NextResponse.json(
          {
            error: isNetworkError
              ? 'Could not reach the AI service — please check your internet connection and try again.'
              : 'Smart Chef encountered an error',
          },
          { status: 500 }
        )
    }
}
