import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

export type MediaClassification = {
  type: 'FOOD' | 'DRINK' | 'AMBIANCE' | 'OTHER'
  itemNameTag: string | null
  categoryTag: string | null
}

function normalizeType(value: string): MediaClassification['type'] {
  const upper = value.toUpperCase()
  if (upper === 'FOOD' || upper === 'DRINK' || upper === 'AMBIANCE') return upper
  return 'OTHER'
}

function parseResponse(text: string): MediaClassification | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text)
    return {
      type: normalizeType(String(parsed.type || 'OTHER')),
      itemNameTag: String(parsed.itemNameTag || '').trim() || null,
      categoryTag: String(parsed.categoryTag || '').trim() || null,
    }
  } catch {
    return null
  }
}

export async function classifyMediaAssetWithAI(imageData: string, fileName?: string): Promise<MediaClassification | null> {
  const prompt =
    `Classify this restaurant media image. Return JSON only with keys "type", "itemNameTag", and "categoryTag".
Valid types: FOOD, DRINK, AMBIANCE, OTHER.
Use FOOD for dishes like steak, burgers, desserts.
Use DRINK for juices, coffee, tea, mocktails, soda.
Use AMBIANCE for interiors, tables, dining room, decor, people eating.
Use OTHER if unclear.
itemNameTag should be a short plain-English label like "mango juice", "grilled steak", "restaurant interior".
categoryTag should be a short browse tag like "Grills", "Juices", "Desserts", "Coffee", "Dining Room", "Mocktails", "Starters", "Seafood", "Cocktails", or "Decor".`

  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey })
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `${prompt}\nFile name: ${fileName || 'unknown'}` },
              { type: 'image_url', image_url: { url: imageData } },
            ],
          },
        ],
      })
      const content = response.choices[0]?.message?.content
      if (content) return parseResponse(content)
    } catch (error) {
      console.warn('[media-vision] OpenAI classification failed', error)
    }
  }

  const googleKey = process.env.GOOGLE_AI_KEY
  if (googleKey) {
    try {
      const genAI = new GoogleGenerativeAI(googleKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const base64Data = imageData.replace(/^data:[^;]+;base64,/, '')
      const mimeMatch = imageData.match(/^data:([^;]+);base64,/)
      const result = await model.generateContent([
        `${prompt}\nFile name: ${fileName || 'unknown'}`,
        { inlineData: { mimeType: mimeMatch?.[1] || 'image/jpeg', data: base64Data } },
      ])
      const text = result.response.text()
      if (text) return parseResponse(text)
    } catch (error) {
      console.warn('[media-vision] Gemini classification failed', error)
    }
  }

  return null
}
