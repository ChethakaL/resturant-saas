/**
 * Server-only: generate a menu dish description (max 18 words) using AI.
 * Used when an item is added/saved without a description, and as fallback when displaying the menu.
 * Prompt includes: sensory triggers, texture language, heat descriptors, origin storytelling, scarcity cues.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

const MAX_WORDS = 18

export interface GenerateDescriptionInput {
  itemName: string
  categoryName?: string | null
  tags?: string[] | null
  price?: number | null
  /** Optional existing draft to rewrite (e.g. from paste). */
  existingDraft?: string | null
  /** Tone for descriptions (from Restaurant DNA). e.g. "Write concise, punchy descriptions for fast casual." */
  descriptionTone?: string | null
}

/**
 * Generate a menu description. Returns null if AI is not configured or generation fails.
 */
export async function generateMenuDescription(
  input: GenerateDescriptionInput
): Promise<string | null> {
  if (!process.env.GOOGLE_AI_KEY) return null

  const { itemName, categoryName, tags, price, existingDraft, descriptionTone } = input

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are a menu description writer for a restaurant. Write a single, appetizing dish description.
${descriptionTone?.trim() ? `\nRestaurant description tone (match this style): ${descriptionTone.trim()}\n` : ''}

RULES:
- Maximum ${MAX_WORDS} words. Count and do not exceed.
- Use sensory triggers (how it looks, smells, tastes).
- Use texture language (crispy, tender, creamy, flaky, silky, etc.).
- Use heat descriptors where relevant (warm, steaming, chilled, sizzling, etc.).
- Include origin storytelling when it fits (e.g. "slow-cooked in the traditional way", "from our family recipe").
- Add subtle scarcity or specialness cues where natural (e.g. "chef's special", "limited", "house favourite") — do not overdo it.

Dish name: "${itemName}"
${categoryName ? `Category: ${categoryName}` : ''}
${tags?.length ? `Tags: ${tags.join(', ')}` : ''}
${price != null ? `Price: ${price}` : ''}
${existingDraft?.trim() ? `Existing draft to rewrite (keep under ${MAX_WORDS} words): ${existingDraft}` : ''}

Return your response in this exact JSON format only:
{
  "description": "Your menu description here, under ${MAX_WORDS} words."
}

Return ONLY valid JSON, no markdown or extra text.`

  try {
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    let jsonText = responseText.trim()
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) jsonText = jsonMatch[0]

    const data = JSON.parse(jsonText) as { description?: string }
    const description = (data.description || '').trim()
    if (!description) return null

    // Enforce max words: take first 18 words if AI overstepped
    const words = description.split(/\s+/)
    const capped = words.length > MAX_WORDS ? words.slice(0, MAX_WORDS).join(' ') : description
    return capped
  } catch {
    return null
  }
}
