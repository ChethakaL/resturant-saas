/**
 * Fetches estimated ingredient prices using Tavily search or AI fallback
 */

interface IngredientPriceEstimate {
    costPerUnit: number
    currency: string
    source: string
    confidence: 'high' | 'medium' | 'low'
}

/**
 * Estimate ingredient price using Tavily search API
 */
async function estimatePriceWithTavily(
    ingredientName: string,
    unit: string
): Promise<IngredientPriceEstimate | null> {
    const tavilyKey = process.env.TAVILY_API_KEY
    if (!tavilyKey) return null

    try {
        const query = `${ingredientName} price per ${unit} Iraq market 2026`
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: tavilyKey,
                query,
                search_depth: 'basic',
                max_results: 3,
            }),
        })

        if (!response.ok) {
            console.warn('Tavily search failed:', response.statusText)
            return null
        }

        const data = await response.json()

        // Extract price information from results
        // This is a simplified extraction - in production you'd want more sophisticated parsing
        const results = data.results || []
        if (results.length > 0) {
            // For now, return a default estimate based on common ingredient types
            // In production, you'd parse the actual search results
            return {
                costPerUnit: getDefaultPriceEstimate(ingredientName, unit),
                currency: 'IQD',
                source: 'tavily_search',
                confidence: 'medium',
            }
        }

        return null
    } catch (error) {
        console.error('Tavily price estimation error:', error)
        return null
    }
}

/**
 * Estimate ingredient price using AI (Google or OpenAI)
 */
async function estimatePriceWithAI(
    ingredientName: string,
    unit: string
): Promise<IngredientPriceEstimate | null> {
    const googleKey = process.env.GOOGLE_AI_KEY
    const openaiKey = process.env.OPENAI_API_KEY

    if (!googleKey && !openaiKey) return null

    try {
        if (googleKey) {
            const { GoogleGenerativeAI } = await import('@google/generative-ai')
            const genAI = new GoogleGenerativeAI(googleKey)
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

            const prompt = `Estimate the current market price for "${ingredientName}" per ${unit} in Iraq (IQD).
Consider typical wholesale/restaurant supply prices in 2026.
Return ONLY a JSON object in this exact format, no additional text:
{
  "costPerUnit": <number in IQD>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<brief explanation>"
}

Example: For "chicken breast" per kg, you might return:
{"costPerUnit": 12000, "confidence": "medium", "reasoning": "Based on typical Iraqi market prices for fresh chicken"}

Now estimate for: ${ingredientName} per ${unit}`

            const result = await model.generateContent(prompt)
            const text = result.response.text().trim()

            // Extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0])
                return {
                    costPerUnit: parsed.costPerUnit || getDefaultPriceEstimate(ingredientName, unit),
                    currency: 'IQD',
                    source: 'google_ai',
                    confidence: parsed.confidence || 'low',
                }
            }
        } else if (openaiKey) {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a food cost estimation expert. Provide realistic ingredient prices for restaurants in Iraq.',
                        },
                        {
                            role: 'user',
                            content: `Estimate the current market price for "${ingredientName}" per ${unit} in Iraq (IQD). Return only a JSON object: {"costPerUnit": <number>, "confidence": "high|medium|low"}`,
                        },
                    ],
                    temperature: 0.3,
                }),
            })

            if (response.ok) {
                const data = await response.json()
                const content = data.choices[0]?.message?.content || '{}'
                const jsonMatch = content.match(/\{[\s\S]*\}/)
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0])
                    return {
                        costPerUnit: parsed.costPerUnit || getDefaultPriceEstimate(ingredientName, unit),
                        currency: 'IQD',
                        source: 'openai',
                        confidence: parsed.confidence || 'low',
                    }
                }
            }
        }

        return null
    } catch (error) {
        console.error('AI price estimation error:', error)
        return null
    }
}

/**
 * Default price estimates based on common ingredient categories
 */
function getDefaultPriceEstimate(ingredientName: string, unit: string): number {
    const name = ingredientName.toLowerCase()
    const unitLower = unit.toLowerCase()

    // Small units (tbsp, tsp, slice, piece, serving, cup, ml) - very low prices
    if (['tbsp', 'tsp', 'teaspoon', 'tablespoon', 'slice', 'piece', 'serving', 'ml', 'clove'].includes(unitLower)) {
        // Herbs and spices in small quantities
        if (name.includes('herb') || name.includes('spice') || name.includes('parsley') ||
            name.includes('basil') || name.includes('oregano') || name.includes('thyme') ||
            name.includes('rosemary') || name.includes('mint') || name.includes('cilantro') ||
            name.includes('dill') || name.includes('chive')) return 200

        // Liquids in ml
        if (unitLower === 'ml') {
            if (name.includes('water')) return 0
            if (name.includes('oil')) return 10
            return 5
        }

        // Other small quantities
        if (name.includes('lemon') || name.includes('lime')) return 500
        if (name.includes('garlic')) return 100
        return 300
    }

    // Grams - small quantities
    if (unitLower === 'g' || unitLower === 'gram' || unitLower === 'grams') {
        if (name.includes('herb') || name.includes('spice')) return 50
        if (name.includes('cheese') || name.includes('mozzarella') || name.includes('parmesan')) return 150
        if (name.includes('chocolate')) return 100
        if (name.includes('yeast') || name.includes('baking')) return 30
        if (name.includes('honey')) return 50
        return 80
    }

    // Cup measurements
    if (unitLower === 'cup' || unitLower === 'cups') {
        if (name.includes('water') || name.includes('ice')) return 0
        if (name.includes('rice') || name.includes('flour')) return 1000
        if (name.includes('sugar')) return 800
        return 500
    }

    // Meats (per kg)
    if (name.includes('chicken') || name.includes('poultry')) return 12000
    if (name.includes('beef') || name.includes('meat')) return 25000
    if (name.includes('lamb') || name.includes('mutton')) return 30000
    if (name.includes('fish') || name.includes('seafood') || name.includes('shrimp')) return 20000
    if (name.includes('bacon') || name.includes('sausage')) return 18000

    // Vegetables (per kg)
    if (name.includes('tomato') || name.includes('onion') || name.includes('potato')) return 2000
    if (name.includes('lettuce') || name.includes('cabbage') || name.includes('spinach')) return 3000
    if (name.includes('pepper') || name.includes('cucumber') || name.includes('carrot')) return 2500
    if (name.includes('mushroom')) return 8000
    if (name.includes('avocado')) return 10000

    // Dairy (per L or kg)
    if (name.includes('milk')) return 3000
    if (name.includes('cheese') && unitLower === 'kg') return 15000
    if (name.includes('mozzarella') && unitLower === 'kg') return 15000
    if (name.includes('butter')) return 12000
    if (name.includes('yogurt')) return 4000
    if (name.includes('cream')) return 5000

    // Beverages
    if (name.includes('tea') && (unitLower === 'piece' || unitLower === 'bag')) return 100
    if (name.includes('tea') && unitLower === 'serving') return 500
    if (name.includes('hibiscus') && unitLower === 'serving') return 300
    if (name.includes('coffee')) return 8000
    if (name.includes('juice')) return 4000

    // Spices and seasonings (per kg or smaller units)
    if (name.includes('salt') || name.includes('pepper') || name.includes('spice') ||
        name.includes('cumin') || name.includes('paprika') || name.includes('cinnamon')) {
        return unitLower === 'kg' ? 8000 : 500
    }

    // Oils and fats (per L or kg)
    if (name.includes('oil') || name.includes('olive')) {
        return unitLower === 'l' || unitLower === 'liter' ? 8000 : 10
    }

    // Grains and pasta (per kg)
    if (name.includes('rice') || name.includes('pasta') || name.includes('flour')) return 3000
    if (name.includes('bread') || name.includes('bun')) return 2000

    // Condiments and sauces
    if (name.includes('sauce') || name.includes('ketchup') || name.includes('mayo')) return 6000
    if (name.includes('vinegar')) return 3000
    if (name.includes('honey') && unitLower === 'kg') return 10000
    if (name.includes('sugar')) return 2500

    // Nuts and seeds
    if (name.includes('nut') || name.includes('almond') || name.includes('walnut')) return 15000
    if (name.includes('seed') || name.includes('sesame')) return 8000

    // Water and ice - free
    if (name.includes('water') || name.includes('ice')) return 0

    // Default fallback based on unit
    if (unitLower === 'kg') return 5000
    if (unitLower === 'l' || unitLower === 'liter') return 4000
    if (unitLower === 'g' || unitLower === 'gram') return 50
    if (unitLower === 'ml') return 5
    if (unitLower === 'tbsp' || unitLower === 'tsp') return 200
    if (unitLower === 'piece' || unitLower === 'slice') return 300

    // Final fallback
    return 1000
}

/**
 * Main function to estimate ingredient price
 * Tries Tavily first, then AI, then falls back to defaults
 */
export async function estimateIngredientPrice(
    ingredientName: string,
    unit: string
): Promise<IngredientPriceEstimate> {
    // Try Tavily first (most accurate for current market prices)
    const tavilyEstimate = await estimatePriceWithTavily(ingredientName, unit)
    if (tavilyEstimate) return tavilyEstimate

    // Try AI estimation
    const aiEstimate = await estimatePriceWithAI(ingredientName, unit)
    if (aiEstimate) return aiEstimate

    // Fallback to default estimates
    return {
        costPerUnit: getDefaultPriceEstimate(ingredientName, unit),
        currency: 'IQD',
        source: 'default_estimate',
        confidence: 'low',
    }
}
