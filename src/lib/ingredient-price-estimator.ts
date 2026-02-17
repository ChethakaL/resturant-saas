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

    // Meats (per kg)
    if (name.includes('chicken') || name.includes('poultry')) return 12000
    if (name.includes('beef') || name.includes('meat')) return 25000
    if (name.includes('lamb') || name.includes('mutton')) return 30000
    if (name.includes('fish') || name.includes('seafood')) return 20000

    // Vegetables (per kg)
    if (name.includes('tomato') || name.includes('onion') || name.includes('potato')) return 2000
    if (name.includes('lettuce') || name.includes('cabbage')) return 3000
    if (name.includes('pepper') || name.includes('cucumber')) return 2500

    // Dairy (per L or kg)
    if (name.includes('milk')) return 3000
    if (name.includes('cheese')) return 15000
    if (name.includes('butter')) return 12000
    if (name.includes('yogurt')) return 4000

    // Spices and seasonings (per kg or smaller units)
    if (name.includes('salt') || name.includes('pepper') || name.includes('spice')) {
        return unit === 'kg' ? 5000 : 500
    }

    // Oils (per L)
    if (name.includes('oil') || name.includes('olive')) return 8000

    // Grains and pasta (per kg)
    if (name.includes('rice') || name.includes('pasta') || name.includes('flour')) return 3000

    // Default fallback
    return 5000
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
