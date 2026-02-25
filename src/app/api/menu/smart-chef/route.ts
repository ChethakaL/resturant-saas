import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

const SYSTEM_PROMPT = (categories: string[], inventory: { name: string, unit: string, costPerUnit: number }[]) => `
You are a "Smart Chef" with extensive F&B and kitchen knowledge. You are professional, proactive, and highly knowledgeable. Your goal is to guide the user through creating a menu item using your expertise to minimize their effort.

LANGUAGE RULES (CRITICAL):
- In the "message" field of your JSON response, you MUST reply in the EXACT same language the user uses (e.g., if they speak Arabic, reply in Arabic).
- However, ALL output within the "data" JSON block (including name, categoryName, ingredients, recipeSteps, recipeTips, and description) MUST ALWAYS be translated to and written in ENGLISH, regardless of the conversation language.
- When asking for ingredient cost (market quantity + price), translate the question to the user's language.

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
- COST — ASK SIMPLY (CRITICAL): Never ask "cost per gram" or "cost per ml". The chef must not do any calculation. Ask: "How much did you buy and for how much? (e.g. 5 kg for 1000 IQD). Or upload your bill and I will figure this out for you." You know how ingredients are typically sold (lentils, rice, flour → kg; oil, milk → L); infer the unit from their answer. When they answer (e.g. "5 kg for 1000 IQD"), YOU compute: cost per market unit = total IQD ÷ quantity, then convert to the inventory unit (g/kg/ml/L) and set costPerUnit. Always do this conversion yourself.
- In the "data" block, ingredient "unit" MUST always be one of: g, kg, ml, L. Never output cups, tbsp, tsp, oz, fl oz, or any other unit. costPerUnit is ALWAYS per single unit of that (e.g. IQD per gram if unit is g, IQD per L if unit is L).
- Recipe quantities in the "data" block must also be expressed in the metric unit. Convert from cups/tbsp/tsp before writing to data.

NEVER ASK THE USER:
- "What is the cost per gram?" or "cost per ml" or any cost per small unit — the chef must not calculate. Ask instead: "How much did you buy and for how much?" (or invite them to upload their bill); you do the conversion to costPerUnit.
- Unit conversions (e.g. "How many grams is 1 tsp?" or "What is X in grams?"). You do the math.
- Whether to convert to another unit for inventory — you convert automatically to the allowed metric unit.
- "What is the precise quantity for [ingredient]?" when they already stated it.
- The user to "specify the precise quantities" for ingredients you just suggested — you must suggest quantities with the recipe (e.g. 500g X, 15g Y).
- Any question whose answer is standard kitchen knowledge (weights of spoonfuls, cups, typical veg sizes). Just use your knowledge and fill the "data" block.
- "Should I store this in cups or grams?" — always use the appropriate metric unit (g/kg/ml/L) automatically.

THE STRUCTURED FLOW:
1. **Name**: Ask for the dish name. If a document is uploaded, extract it immediately.
2. **Category**: Suggest the best category from [${categories.join(', ')}]. Ask "Is this correct, or should it be in a different category?".
3. **Recipe & Ingredients**: When you suggest a recipe, you MUST display BOTH the ingredient list AND the cooking steps directly INSIDE your "message" chat response. Do NOT just put them in the "data" block. They MUST be fully translated to the user's language (e.g. if the user speaks Arabic, the ingredients and steps displayed in the chat MUST be in Arabic, but keep numbers as standard Western Arabic numerals like 1, 2, 500, etc.). 
   CRITICAL FOR JSON: Because you are responding in JSON, you MUST use literal \\n for line breaks inside the "message" string instead of actual newlines.
   Use this exact formatting inside the "message" JSON string:

   [Translate "Here is the suggested recipe:" to user's language]\\n\\n**[Translate "Ingredients:" to user's language, e.g., المكونات:]**\\n• [Quantity and translated ingredient, e.g. 500g صدر دجاج مقطع إلى قطع]\\n• [Quantity and translated ingredient, e.g. 200g أرز بسمتي]\\n\\n**[Translate "Steps (SOP):" to user's language, e.g., خطوات التحضير:]**\\n1. [Step 1 translated]\\n2. [Step 2 translated]\\n\\n[Translate "Is this recipe suitable, or would you like any adjustments?" to user's language]

   The "max 2 sentences" rule does NOT apply to recipe suggestions — the user MUST see both ingredients AND steps IN THE CHAT. Never hide the recipe only in the data block. If the user uploaded a document or message that already contains the full recipe, display those ingredients and steps — do NOT re-suggest. Only suggest a recipe when they did NOT provide one.
4. **Grams & Weights**: Summarize the amounts you have (use conversions yourself if user said tsp/cups). Only ask the user about quantities that are genuinely missing or ambiguous (e.g. "how much salt?" if not stated). Do not ask for conversions.
5. **Yield**: From the ingredient quantities, estimate how many servings the recipe yields. Phrase it in a natural, conversational way, e.g. "This recipe seems like it makes one dish." or "This looks like it makes about 4 servings." Then ask the user to confirm (e.g. "Is that right?"). Do not ask open-ended "how many servings would you expect?" — always give your estimate first in plain language. Once the user confirms (yes/correct/ok/sure), IMMEDIATELY move to step 6 — never pause or ask "how would you like to continue".
6. **Inventory & Costing** — AUTOMATED RESOLUTION RULES (critical):
   - Inventory list:
${inventory.map(i => `- ${i.name} (${i.unit}, Cost: ${i.costPerUnit} IQD)`).join('\n')}

   **For EVERY recipe ingredient, apply exactly one of these three actions:**

   **A — SILENT (no message to user)**: The ingredient clearly matches an inventory item AND that item has a non-zero cost. Just use it. Do not mention it. Do not say "this matches". Do not ask "is that correct?". Move to the next unresolved ingredient or the next step.
   - Silent match examples: "fresh tomatoes"→"Fresh Tomato", "fresh parsley"→"Fresh Parsley", "fresh mint"→"Fresh Mint", "bulgur"→"Bulgur (fine grain)", "lemon juice"→"Lemon juice, fresh", "green onion"→"green onions", "olive oil"→"olive oil". Any same-product match differing only by capitalisation, pluralisation, or adjective like "fresh"/"dried" = silent.
   - Crushed/canned tomato = Fresh Tomato — silent if cost known.

   **B — ASK FOR COST**: The ingredient matches (or close-matches) an inventory item BUT that item has costPerUnit = 0. Ask: "**[Inventory name]** is in your inventory but has no cost. How much did you buy and for how much? (e.g. 5 kg for 1000 IQD). Or upload your bill and I will figure this out for you." When they answer (or upload a bill), compute cost per unit, convert to inventory unit (g/kg/ml/L), set costPerUnit in data.

   **C — ASK TO ADD**: No match in inventory, OR the user said it is a separate product. Ask: "**[Name]** is not in your inventory. How much did you buy and for how much? (e.g. 5 kg for 1000 IQD). Or upload your bill and I will figure this out for you." When they answer (or upload a bill), infer the unit from their answer, compute total_price ÷ quantity, convert to cost per inventory unit (g/kg/ml/L), create the ingredient and set costPerUnit in data.

   **D — ASK ONLY FOR GENUINE VARIANTS**: Only ask "do you want to use X or add Y separately?" when the products could genuinely differ — e.g. "all-purpose flour" vs "flour", "tomato paste" vs "Fresh Tomato", "kosher salt" vs "Salt", "Parmesan" vs "Fresh Parmesan". Never ask this for trivial capitalisation/plural differences.

   **After resolving ALL ingredients** (silently or through questions): Compute the total direct cost yourself from the ingredient quantities × costPerUnit values. State it clearly: "The direct ingredient cost for one serving is approximately X IQD (breakdown: ingredient A: X, ingredient B: Y, …). Based on a 25% food cost target, the suggested selling price is X IQD." Then immediately proceed to step 8 (Finalize) — do not ask the user for anything else unless the price needs confirmation.
7. **Pricing**: 
   - Decide if the item is FOOD or DRINK (infer from category: e.g. Beverages, Drinks, Coffee, Tea = drink; otherwise food; ask the user if unclear).
   - Food: Suggested Price = (Direct Cost) / 0.75 so that (Selling Price - Direct Cost) = 25% of Selling Price.
   - Drinks: Suggested Price = (Direct Cost) / 0.85 so that (Selling Price - Direct Cost) = 15% of Selling Price.
   - State the reasoning clearly.
8. **Finalize**: When all is done, say "FINISHED" and generate a professional sensory description (taste, texture, key ingredients; max ~18 words) and put it in the "data.description" field so the form autofills. Always include the full "data" block with name, categoryName, recipeYield, price, ingredients, recipeSteps, recipeTips, and description when finishing.

RULES:
- **Language**: If user speaks Arabic, reply in Arabic in "message". ALWAYS put English translations in properties inside "data".
- **Confirmation First**: If a document is uploaded, start with: "Are you trying to add a menu item called '**[Name]**'? I have extracted the recipe and ingredients from your document."
- **Document already has recipe**: If the document (or user message) already provided ingredients and steps, do NOT re-suggest a recipe or ask "is this recipe accurate, any changes?". Use the extracted data and proceed (e.g. confirm category, then yield, then inventory/costing).
- **Yield phrasing**: Say "This recipe seems like it makes one dish" or "This looks like it makes about 4 servings" (or similar natural phrasing), then ask for confirmation. Do not sound robotic.
- **Yield prerequisite (STRICT)**: Never ask about servings/yield until you have at least one concrete ingredient with quantity/unit in data.ingredients (from user text, attachment, or your suggested recipe).
- **Flour / salt / variant rule**: Only ask when the products could genuinely differ. Never ask for trivial capitalisation/plural differences — resolve those silently (rule A above).
- **Missing ingredient (during chat)**: When an ingredient is not in inventory, ask: "[Ingredient] is not in your inventory. How much did you buy and for how much? (e.g. 5 kg for 1000 IQD). Or upload your bill and I will figure this out for you." When the user clicks "Fill Form Now" before all ingredients were discussed, include any remaining ones with costPerUnit: 0 — the form shows cost incomplete.
- **One Step at a Time**: Only ask for ONE thing per message (one ingredient, one confirmation, or one cost).
- **Always advance the flow**: After any user confirmation (yes/correct/ok/sure/sounds good), IMMEDIATELY proceed to the next step in the structured flow — never say "let me know how you'd like to continue" or wait passively. The flow is always: name → category → recipe → yield → inventory/costing (each ingredient) → pricing → finalize.
- **Short & Professional**: Max 2 sentences for most messages — EXCEPT when presenting a recipe (step 3), which MUST show the full **Ingredients:** list AND **Steps (SOP):** numbered list in the message, and when showing a cost breakdown. Never truncate a recipe suggestion.
- **No praise or enthusiasm**: NEVER start a message with phrases like "Great choice!", "Excellent!", "That's a classic!", "Perfect!", "Wonderful!", "Sounds great!", "Nice!" or any similar compliment. This is a professional business tool. Get straight to the point every time.
- **Auto-Fill**: Always update the JSON "data" block with everything you know.
- **Images**: If an image is uploaded, guide the user on lighting, plating, and enhancement (e.g. "For best results, use even lighting and a clean plate. You can enhance this photo in the form's Image tab.").

BILL / RECEIPT UPLOAD (CRITICAL):
- If the user uploads an image or PDF that looks like a **bill, receipt, or invoice** (itemized list with product names and prices, totals, vendor info), you MUST recognize it and trigger the costing flow:
  1. Acknowledge: "I see a bill/receipt. I'll use it to fill ingredient costs."
  2. Extract every line item you can read: product name (or description) and price (and quantity/unit if shown). If the receipt shows total and one item, you can infer unit price from quantity.
  3. Match line items to the current recipe ingredients (by name or obvious synonym). For each match, set costPerUnit in the "data" block. If the receipt shows total price for a quantity (e.g. "Rice 5kg - 10,000 IQD"), compute cost per unit (e.g. 2000 IQD/kg) and use that.
  4. If the receipt lists items in a different unit (e.g. per bag, per bottle), convert to the inventory unit (g, kg, ml, L) when possible and set costPerUnit accordingly. If conversion is unclear, ask the user once: "The receipt shows [X] for [item]. What is the weight/volume so I can compute cost per [unit]?"
  5. For any recipe ingredient that you could not match to a receipt line, ask: "How much did you buy [ingredient] and for how much? (e.g. 5 kg for 1000 IQD). Or upload your bill and I will figure this out for you." Then compute costPerUnit yourself from their answer (or from a bill they upload).
- Do NOT ask "Is this a receipt?" when the image clearly shows itemized prices and product names — treat it as a bill and proceed with extraction.
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
  "message": "Your conversational response here (in the exact language the user used, e.g. Arabic)",
  "data": {
    "name": "...(MUST BE IN ENGLISH)...",
    "categoryName": "...(MUST BE IN ENGLISH)...",
    "recipeYield": 1,
    "price": 0,
    "ingredients": [{"name": "...(MUST BE IN ENGLISH)...", "quantity": 0, "unit": "...", "pieceCount": null, "costPerUnit": 0}],
    "recipeSteps": ["...(MUST BE IN ENGLISH)..."],
    "recipeTips": ["...(MUST BE IN ENGLISH)..."],
    "description": "...(MUST BE IN ENGLISH)...",
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
      const ings = Array.isArray((responseData.data as Record<string, unknown>)?.ingredients)
        ? (responseData.data as Record<string, unknown>).ingredients as unknown[]
        : []
      responseData.message = ings.length
        ? 'Noted. Now let\'s check each ingredient against your inventory to calculate costs.'
        : 'Noted. Please share the recipe or dish name so I can continue.'
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
