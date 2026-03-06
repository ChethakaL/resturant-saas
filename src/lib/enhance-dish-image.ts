import { enforceImageDimensions } from '@/lib/image-processor'
import {
  ImageOrientation,
  ImageSizePreset,
  imageOrientationPrompts,
  imageSizePrompts,
} from '@/lib/image-format'
import { getImageModelGenerateContentUrl, DISH_GROUNDING_PROMPT, DISH_SCALE_PROMPT } from '@/lib/image-api-model'
import {
  analyzeDishImageForFixes,
  formatAnalysisForPrompt,
  analysisSaysStillFloating,
} from '@/lib/analyze-dish-image'

const ENHANCEMENT_PROMPT = `
You are editing a real photo of a cooked dish. Create a restaurant-quality menu photo of THE SAME EXACT DISH.

CAMERA ANGLE: Use the same or a similar camera angle as the input food image—match the perspective (e.g. top-down, 3/4 view, or slight high angle) so the dish type is shown appropriately. Do not invent a completely different angle.

FOOD SIZE: The food must be at actual, realistic size. The dish is the main subject and must fill the frame appropriately—like a real menu photo. A pizza is a full-size pizza; a burger is a real portion. Not miniature. The plate and food should occupy most of the image.

PLATE ON SURFACE: The plate or bowl must be physically on the table. No gap, no elevation, no floating.

BACKGROUND: When a reference background image is provided, match it exactly so this menu item looks consistent with the others—same surface, same lighting style, same mood. If no reference, use a clean restaurant-style background.

Return one photorealistic image. Same food (same ingredients, plate). Adjust only: angle to match input where appropriate, lighting, background for consistency. No text, no logos.

${DISH_GROUNDING_PROMPT}

${DISH_SCALE_PROMPT}
`

/** Single-purpose prompt for second pass when the first output still has a floating dish. */
const FIX_FLOATING_ONLY_PROMPT = `This image shows the dish or plate floating or elevated above the table. Your ONLY job: correct it so the plate is ON the table.

- The bottom of the plate must touch the table surface. No gap. No elevation. No tilt that makes it look like it is in the air.
- Keep the exact same dish, food, background, and lighting. Change ONLY the position so the plate rests on the table. Do not redraw the food.
- Output a single photorealistic image with the plate clearly on the surface.`

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

  // Have Gemini analyze the current image for issues (floating, angle, distance) and produce fix instructions; then pass that into the image model so it can correct before returning the final result.
  let analysisBlock = ''
  try {
    const analysis = await analyzeDishImageForFixes(imageData)
    if (analysis?.fixInstructions) {
      analysisBlock = `\n\n${formatAnalysisForPrompt(analysis)}\n`
      console.log('[enhance-dish-image] using analysis fix instructions')
    }
  } catch (_) {
    // non-fatal; continue without analysis
  }

  const fullPrompt =
    ENHANCEMENT_PROMPT +
    (orientationHint ? `\n${orientationHint}\n` : '') +
    (sizeHint ? `\n${sizeHint}\n` : '') +
    analysisBlock +
    (backgroundReferenceImageData.trim()
      ? '\n\nBACKGROUND REFERENCE (CONSISTENCY): The second image is the reference background. Your output background must match it so this menu item looks consistent with the others—same surface, same lighting, same style. Do not change the reference background. Blend the dish naturally into that background.'
      : '') +
    (userPrompt.trim() ? `\n\nUSER NOTE: ${userPrompt.trim()}` : '')

  // Instruction first: match angle from input, actual size, consistent background
  const leadingInstruction =
    'Before editing: (1) Match the camera angle to the input food image—use the same or similar perspective. (2) Show the food at actual, realistic size—the dish must be the main subject and fill the frame like a real menu photo, not miniature. (3) If you have a reference background, match it so this item is consistent with others. Now edit the following image:\n\n'
  const parts: Array<Record<string, unknown>> = [
    { text: leadingInstruction },
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
    generationConfig: { responseModalities: ['image'], temperature: 0.2, topK: 16, topP: 0.8 },
  }
  const response = await fetch(
    getImageModelGenerateContentUrl(apiKey),
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

  let finalBase64 = imageBase64
  let finalMime = imageMimeType

  // Second pass: have the model look at its own output and fix if still floating or too small
  const firstDataUrl = `data:${imageMimeType};base64,${imageBase64}`
  const outputAnalysis = await analyzeDishImageForFixes(firstDataUrl)
  const needsFloatingFix = outputAnalysis && analysisSaysStillFloating(outputAnalysis)

  const runCorrectionPass = async (prompt: string): Promise<boolean> => {
    const fixParts: Array<Record<string, unknown>> = [
      { inlineData: { mimeType: finalMime, data: finalBase64 } },
      { text: prompt },
    ]
    const fixBody = {
      contents: [{ parts: fixParts }],
      generationConfig: { responseModalities: ['image'], temperature: 0.15, topK: 10, topP: 0.75 },
    }
    const fixRes = await fetch(getImageModelGenerateContentUrl(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fixBody),
    })
    if (!fixRes.ok) return false
    const fixData = await fixRes.json()
    const fixCandidates = fixData.candidates
    if (!fixCandidates?.length || !fixCandidates[0].content?.parts) return false
    for (const part of fixCandidates[0].content.parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        finalBase64 = part.inlineData.data
        finalMime = part.inlineData.mimeType
        return true
      }
    }
    return false
  }

  if (needsFloatingFix) {
    console.log('[enhance-dish-image] output still floating, running correction pass')
    if (await runCorrectionPass(FIX_FLOATING_ONLY_PROMPT)) console.log('[enhance-dish-image] floating correction done')
  }
  // Do NOT run scale correction pass - it was making the food smaller. Rely on first-pass "fill frame" prompt only.

  const processed = await enforceImageDimensions(finalBase64, orientation, sizePreset)
  const dataUrl = `data:${processed.mimeType};base64,${processed.base64}`
  return { dataUrl }
}
