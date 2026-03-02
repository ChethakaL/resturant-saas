import { enforceImageDimensions } from '@/lib/image-processor'
import {
  ImageOrientation,
  ImageSizePreset,
  imageOrientationPrompts,
  imageSizePrompts,
} from '@/lib/image-format'

const ENHANCEMENT_PROMPT = `
You are editing a real photo of a cooked dish. Your job is to create a restaurant-quality menu photograph of THE SAME EXACT DISH.

TOP PRIORITY RULE:
- Return a final, full-frame photorealistic image with NO transparency and NO checkerboard/alpha artifacts.

GOAL:
- Make it look like professional food photography (studio lighting, appetizing color, crisp detail).
- Move the dish onto a clean, professional tabletop/studio background (e.g., neutral plate on a nice table or seamless backdrop).
- Improve composition: straighten perspective, crop, and reframe to a pleasing menu-photo angle (3/4 angle or top-down, whichever suits the dish).

STRICT PRESERVATION (MOST IMPORTANT):
- Do NOT change what the user cooked.
- Do NOT add, remove, replace, or invent any ingredients, garnishes, sauces, steam, props, utensils, extra food, or plate decorations that were not already present.
- Keep the same portion sizes, shapes, textures, and arrangement of the food and plate/bowl.
- Keep identifying details of the dish (toppings, edges, crumbs, burn marks, cuts, placement) consistent with the original.
- Only change: lighting, color grading, sharpness, perspective correction, and BACKGROUND/surface.

    BACKGROUND RULES:
    - Replace the messy/phone background with a clean, premium restaurant-style setting.
    - Use realistic shadows/reflections so the dish sits naturally in the new scene.
    - No text, no logos, no watermarks.

OUTPUT:
- Photorealistic, high-quality menu-style image.
`

export type EnhanceDishImageOptions = {
  imageData: string // base64 or data URL
  userPrompt?: string
  backgroundReferenceImageData?: string
  orientation?: ImageOrientation
  sizePreset?: ImageSizePreset
}

/**
 * Server-side only. Enhances a dish image with Gemini and returns a data URL.
 */
export async function enhanceDishImage(options: EnhanceDishImageOptions): Promise<{ dataUrl: string }> {
  const {
    imageData,
    userPrompt = '',
    backgroundReferenceImageData = '',
    orientation = 'landscape',
    sizePreset = 'medium',
  } = options

  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) {
    throw new Error('Google AI API key not configured')
  }

  const base64Data = (imageData.includes(',') ? imageData.split(',')[1] : imageData)?.trim() ?? ''
  const originalMime = imageData.includes(',')
    ? imageData.split(',')[0].split(':')[1]?.split(';')[0]?.trim()
    : 'image/jpeg'
  let geminiMimeType = originalMime && originalMime.startsWith('image/') ? originalMime : 'image/jpeg'
  if (!base64Data || base64Data.length < 100) {
    console.warn('[enhance-dish-image] dish image base64 very short or empty, length=%d', base64Data.length)
  }
  console.log('[enhance-dish-image] dish: mime=%s, base64Length=%d', geminiMimeType, base64Data.length)

  const orientationHint = imageOrientationPrompts[orientation] ?? ''
  const sizeHint = imageSizePrompts[sizePreset] ?? ''
  const fullPrompt =
    ENHANCEMENT_PROMPT +
    (orientationHint ? `\n${orientationHint}\n` : '') +
    (sizeHint ? `\n${sizeHint}\n` : '') +
    (backgroundReferenceImageData.trim()
      ? '\n\nBACKGROUND REFERENCE IMAGE PROVIDED (IMMUTABLE): The reference background must remain unchanged in style and appearance. Do not repaint, redesign, replace, or add/remove any background objects, textures, surfaces, or lighting elements. Keep the dish realistic and blended naturally into that same background.'
      : '') +
    (userPrompt.trim() ? `\n\nUSER NOTE: ${userPrompt.trim()}` : '')

  const parts: Array<Record<string, unknown>> = [
    { inlineData: { mimeType: geminiMimeType, data: base64Data } },
  ]
  if (backgroundReferenceImageData.trim()) {
    const bgBase64Data = (backgroundReferenceImageData.includes(',')
      ? backgroundReferenceImageData.split(',')[1]
      : backgroundReferenceImageData
    )?.trim() ?? ''
    const bgMime = backgroundReferenceImageData.includes(',')
      ? backgroundReferenceImageData.split(',')[0].split(':')[1]?.split(';')[0]?.trim()
      : 'image/jpeg'
    const bgMimeNormalized = bgMime?.startsWith('image/') ? bgMime : 'image/jpeg'
    console.log('[enhance-dish-image] background reference: mime=%s, base64Length=%d', bgMimeNormalized, bgBase64Data.length)
    parts.push({
      inlineData: {
        mimeType: bgMimeNormalized,
        data: bgBase64Data,
      },
    })
  }
  parts.push({ text: fullPrompt })
  console.log('[enhance-dish-image] sending to Gemini: partsCount=%d, promptLength=%d', parts.length, fullPrompt.length)

  const requestBody = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['image'], temperature: 0.3, topK: 20, topP: 0.85 },
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[enhance-dish-image] AI image API error: status=%s, body=%s', response.status, errorText.slice(0, 500))
    throw new Error(`AI image service error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const candidates = data.candidates
  if (!candidates?.length || !candidates[0].content?.parts) {
    throw new Error('No enhanced image generated by AI')
  }

  let imageBase64: string | null = null
  let imageMimeType = 'image/png'
  for (const part of candidates[0].content.parts) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      imageBase64 = part.inlineData.data
      imageMimeType = part.inlineData.mimeType
      break
    }
  }
  if (!imageBase64) {
    console.error('[enhance-dish-image] AI returned no image data')
    throw new Error('No image data in AI response')
  }
  console.log('[enhance-dish-image] AI returned image, base64Length=%d', imageBase64.length)

  const processed = await enforceImageDimensions(imageBase64, orientation, sizePreset)
  const dataUrl = `data:${processed.mimeType};base64,${processed.base64}`
  return { dataUrl }
}
