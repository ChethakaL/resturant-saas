import sharp from 'sharp'
import { enforceImageDimensions } from '@/lib/image-processor'
import type { ImageOrientation, ImageSizePreset } from '@/lib/image-format'
import { getImageModelGenerateContentUrl } from '@/lib/image-api-model'

type GeminiPart = {
  inlineData?: {
    mimeType?: string
    data?: string
  }
}

export class StrictBackgroundLockError extends Error {
  code: 'SEGMENTATION_WEAK' | 'PROCESSING_FAILED'
  constructor(message: string, code: 'SEGMENTATION_WEAK' | 'PROCESSING_FAILED' = 'PROCESSING_FAILED') {
    super(message)
    this.name = 'StrictBackgroundLockError'
    this.code = code
  }
}

function parseDataUrl(imageData: string): { base64: string; mimeType: string } {
  const base64 = imageData.includes(',') ? imageData.split(',')[1]?.trim() ?? imageData.trim() : imageData.trim()
  const mimeType = imageData.includes(',')
    ? imageData.split(',')[0].split(':')[1]?.split(';')[0]?.trim()
    : 'image/jpeg'
  const normalizedMime = mimeType?.startsWith('image/') ? mimeType : 'image/jpeg'
  return { base64, mimeType: normalizedMime }
}

async function callGeminiImage(
  parts: Array<Record<string, unknown>>,
  options?: { temperature?: number; topP?: number }
): Promise<{ base64: string; mimeType: string }> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('Google AI API key not configured')

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['image'],
      temperature: options?.temperature ?? 0.4,
      topP: options?.topP ?? 0.9,
    },
  }

  const response = await fetch(getImageModelGenerateContentUrl(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI image service error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const contentParts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? []
  const imagePart = contentParts.find((part) => part.inlineData?.mimeType?.startsWith('image/'))
  const outBase64 = imagePart?.inlineData?.data
  const outMime = imagePart?.inlineData?.mimeType || 'image/png'
  if (!outBase64) throw new Error('AI did not return image data')
  return { base64: outBase64, mimeType: outMime }
}

/**
 * Pure AI approach: send the dish photo + reference background to Gemini
 * and let it generate a professional menu photo. One AI call, no cutout/compositing.
 */
export async function enhanceDishWithLockedBackground(options: {
  dishImageData: string
  backgroundImageData: string
  userPrompt?: string
  fixInstructionsFromAnalysis?: string
  orientation?: ImageOrientation
  sizePreset?: ImageSizePreset
}): Promise<{ dataUrl: string }> {
  const {
    dishImageData,
    backgroundImageData,
    userPrompt = '',
    fixInstructionsFromAnalysis = '',
    orientation = 'landscape',
    sizePreset = 'medium',
  } = options

  const dishParsed = parseDataUrl(dishImageData)
  const bgParsed = parseDataUrl(backgroundImageData)

  const prompt = [
    'CLOSE-UP food photography for a restaurant menu card.',
    '',
    'IMAGE 1 = the dish. IMAGE 2 = reference for background color/style only.',
    '',
    'CRITICAL SIZE RULE: The food MUST be the HERO of this image. It MUST fill AT LEAST 80% of the image width and be vertically centered. Imagine zooming in so close that the plate edges nearly touch the left and right sides of the frame. There should be very little background visible — just enough to give context. This is a TIGHT CLOSE-UP, not a table scene.',
    '',
    'RULES:',
    '- Keep the EXACT same dish from Image 1 — same food, same toppings, same plate. Do not change the food.',
    '- FILL THE FRAME with the dish. The food is the star. Minimal background.',
    '- Use the color palette and surface style from Image 2 for the small amount of visible background.',
    '- Natural contact shadow under the plate. Not floating.',
    '- Warm, appetizing food photography lighting.',
    '- No text, no watermarks, no borders, no other objects.',
    fixInstructionsFromAnalysis.trim() ? `- Fix this: ${fixInstructionsFromAnalysis.trim()}` : '',
    userPrompt.trim() ? `- ${userPrompt.trim()}` : '',
  ].filter(Boolean).join('\n')

  console.log('[locked-bg] pure AI generation — one call with dish + background reference')

  const result = await callGeminiImage([
    { inlineData: { mimeType: dishParsed.mimeType, data: dishParsed.base64 } },
    { inlineData: { mimeType: bgParsed.mimeType, data: bgParsed.base64 } },
    { text: prompt },
  ])

  const normalizedBg = await enforceImageDimensions(bgParsed.base64, orientation, sizePreset)
  const outputBuffer = await sharp(Buffer.from(result.base64, 'base64'))
    .resize(normalizedBg.width, normalizedBg.height, { fit: 'cover' })
    .jpeg({ quality: 92 })
    .toBuffer()

  console.log('[locked-bg] done — pure AI result %dx%d', normalizedBg.width, normalizedBg.height)
  return { dataUrl: `data:image/jpeg;base64,${outputBuffer.toString('base64')}` }
}
