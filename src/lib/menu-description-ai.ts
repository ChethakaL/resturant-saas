/**
 * Server-only: generate a menu dish description using AI.
 * When descriptionTone is set (Restaurant DNA), it takes precedence over default length and style.
 * Default: max 18 words. With tone: up to 70 words so 2–3 sentences are possible.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

const DEFAULT_MAX_WORDS = 18
const MAX_WORDS_WHEN_TONE_SET = 70

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
  const hasTone = Boolean(descriptionTone?.trim())
  const maxWords = hasTone ? MAX_WORDS_WHEN_TONE_SET : DEFAULT_MAX_WORDS

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are a menu description writer for a restaurant.
${hasTone
    ? `CRITICAL — Restaurant description tone (follow this first; it overrides default length and style):\n${descriptionTone!.trim()}\n\nLength: up to ${maxWords} words so the tone's format (e.g. 2–3 sentences) can be followed.`
    : `Write a single, appetizing dish description. Maximum ${maxWords} words.`}

RULES (apply in a way that respects the restaurant tone above when set):
- Use sensory triggers (how it looks, smells, tastes).
- Use texture language (crispy, tender, creamy, flaky, silky, etc.).
- Use heat descriptors where relevant (warm, steaming, chilled, sizzling, etc.).
- Include origin storytelling when it fits (e.g. "slow-cooked in the traditional way", "from our family recipe").
- Add subtle scarcity or specialness cues where natural (e.g. "chef's special", "limited", "house favourite") — do not overdo it.

Dish name: "${itemName}"
${categoryName ? `Category: ${categoryName}` : ''}
${tags?.length ? `Tags: ${tags.join(', ')}` : ''}
${price != null ? `Price: ${price}` : ''}
${existingDraft?.trim() ? `Existing draft to rewrite (follow tone and length above): ${existingDraft}` : ''}

Return your response in this exact JSON format only:
{
  "description": "Your menu description here, following the tone and length above (max ${maxWords} words)."
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

    const words = description.split(/\s+/)
    const capped = words.length > maxWords ? words.slice(0, maxWords).join(' ') : description
    return capped
  } catch {
    return null
  }
}
