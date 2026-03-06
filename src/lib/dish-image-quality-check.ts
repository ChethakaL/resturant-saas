/**
 * Uses Claude or OpenAI vision to check if a generated dish-on-background image
 * is good: correctly placed, correctly scaled, not floating. Used to retry generation when BAD.
 */
export type DishImageQualityResult = {
  quality: 'GOOD' | 'BAD'
  reason: string
}

const QUALITY_PROMPT = `You are a menu photo quality inspector. This should be a CLOSE-UP food photograph for a restaurant menu card.

Check these criteria:
1. SCALE (most important): The dish MUST fill at least 70% of the image width. The food is the hero — it should dominate the frame with very little background visible. If you can see a lot of empty table/surface and the food is small in the middle, it FAILS. The plate edges should be close to the image edges.
2. PLACEMENT: The dish must be centered and rest naturally on the surface. Not floating.
3. REALISM: Does it look like a professional close-up food photo? No checkerboard patterns, no obvious artifacts.

Reply with ONLY valid JSON, no other text:
- If all 3 checks pass: {"quality":"GOOD"}
- If ANY check fails: {"quality":"BAD","reason":"one sentence explaining the worst problem, focusing on scale if the food is too small"}

Be VERY strict about scale. If you can see more background than food, it's BAD.`

function parseQualityResponse(text: string): DishImageQualityResult {
  const trimmed = text.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed
  try {
    const parsed = JSON.parse(jsonStr) as { quality?: string; reason?: string }
    const quality = parsed.quality?.toUpperCase() === 'GOOD' ? 'GOOD' : 'BAD'
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : ''
    return { quality, reason }
  } catch {
    return { quality: 'BAD', reason: 'Could not parse check response' }
  }
}

/**
 * Returns GOOD if the image passes the quality check, BAD otherwise.
 * Tries Claude first (ANTHROPIC_API_KEY), then OpenAI (OPENAI_API_KEY).
 */
export async function checkDishImageQuality(imageDataUrl: string): Promise<DishImageQualityResult | null> {
  const base64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1]?.trim() : imageDataUrl
  const mime = imageDataUrl.includes(',')
    ? imageDataUrl.split(',')[0].split(':')[1]?.split(';')[0]?.trim()
    : 'image/jpeg'
  const mediaType = mime?.startsWith('image/') ? mime : 'image/jpeg'
  if (!base64 || base64.length < 100) return null

  // Try Claude first
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) {
    try {
      const { Anthropic } = await import('@anthropic-ai/sdk')
      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: base64,
                },
              },
              { type: 'text', text: QUALITY_PROMPT },
            ],
          },
        ],
      })
      const text = response.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
      if (text) return parseQualityResponse(text)
    } catch (err) {
      console.warn('[dish-image-quality-check] Claude check failed', err)
    }
  }

  // Fallback: OpenAI vision
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    try {
      const OpenAI = (await import('openai')).default
      const openai = new OpenAI({ apiKey: openaiKey })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: QUALITY_PROMPT },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: 150,
      })
      const text = completion.choices[0]?.message?.content?.trim()
      if (text) return parseQualityResponse(text)
    } catch (err) {
      console.warn('[dish-image-quality-check] OpenAI check failed', err)
    }
  }

  return null
}
