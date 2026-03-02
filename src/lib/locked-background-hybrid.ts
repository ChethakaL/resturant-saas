import sharp from 'sharp'
import { enforceImageDimensions } from '@/lib/image-processor'
import type { ImageOrientation, ImageSizePreset } from '@/lib/image-format'

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
  if (!base64 || base64.length < 100) {
    console.warn('[locked-background-hybrid] parseDataUrl: very short or empty base64, length=%d', base64?.length ?? 0)
  }
  return { base64, mimeType: normalizedMime }
}

/** Ensure part is valid for Gemini: base64 string and image/* mime. */
function validateImagePart(part: { inlineData?: { mimeType?: string; data?: string } }, label: string): void {
  const data = part.inlineData?.data
  const mime = part.inlineData?.mimeType
  if (!data || typeof data !== 'string') {
    console.warn('[locked-background-hybrid] %s: missing or invalid inlineData.data', label)
  }
  if (!mime || !mime.startsWith('image/')) {
    console.warn('[locked-background-hybrid] %s: invalid mimeType=%s', label, mime)
  }
  const base64Len = data?.length ?? 0
  console.log('[locked-background-hybrid] %s: mime=%s, base64Length=%d', label, mime, base64Len)
}

type GeminiImageOptions = { temperature?: number; topP?: number }

async function callGeminiImage(
  parts: Array<Record<string, unknown>>,
  options?: GeminiImageOptions
): Promise<{ base64: string; mimeType: string }> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) {
    throw new Error('Google AI API key not configured')
  }

  parts.forEach((p, i) => {
    if (p.inlineData && typeof p.inlineData === 'object') {
      const id = p.inlineData as { mimeType?: string; data?: string }
      validateImagePart({ inlineData: id }, `callGeminiImage.parts[${i}]`)
    } else if (p.text) {
      console.log('[locked-background-hybrid] callGeminiImage.parts[%d] text length=%d', i, (p.text as string).length)
    }
  })

  const temperature = options?.temperature ?? 0.2
  const topP = options?.topP ?? 0.8
  const payload = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['image'], temperature, topP },
  }
  const bodyStr = JSON.stringify(payload)
  console.log('[locked-background-hybrid] callGeminiImage: partsCount=%d, requestBodyLength=%d', parts.length, bodyStr.length)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[locked-background-hybrid] AI image API error: status=%s, body=%s', response.status, errorText.slice(0, 500))
    throw new Error(`AI image service error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const contentParts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? []
  const imagePart = contentParts.find((part) => part.inlineData?.mimeType?.startsWith('image/'))
  const outBase64 = imagePart?.inlineData?.data
  const outMime = imagePart?.inlineData?.mimeType || 'image/png'
  if (!outBase64) {
    console.error('[locked-background-hybrid] callGeminiImage: no image in response, parts=%d', contentParts.length)
    throw new Error('AI did not return image data')
  }
  console.log('[locked-background-hybrid] callGeminiImage: success, response image base64Length=%d', outBase64.length)
  return { base64: outBase64, mimeType: outMime }
}

async function extractDishCutoutPng(dishImageData: string): Promise<Buffer> {
  const { base64, mimeType } = parseDataUrl(dishImageData)
  console.log('[locked-background-hybrid] extractDishCutoutPng: mime=%s, base64Length=%d', mimeType, base64.length)
  const cutoutPrompt = [
    'Remove only the background from this dish photo and return only the plated dish (food and plate/bowl).',
    'Keep food and plate exactly as in the source: same angle, perspective, lighting on the dish, no cropping.',
    'Use transparent background (alpha), no checkerboard pattern.',
    'No new objects, no text, no watermark. Output PNG with clean, natural edges.',
  ].join(' ')

  const result = await callGeminiImage([
    { inlineData: { mimeType, data: base64 } },
    { text: cutoutPrompt },
  ])
  console.log('[locked-background-hybrid] extractDishCutoutPng: got cutout, base64Length=%d', result.base64.length)
  return sharp(Buffer.from(result.base64, 'base64')).ensureAlpha().png().toBuffer()
}

function createPlacedAlphaMask(options: {
  dishRgba: Buffer
  dishWidth: number
  dishHeight: number
  canvasWidth: number
  canvasHeight: number
  left: number
  top: number
}): Buffer {
  const { dishRgba, dishWidth, dishHeight, canvasWidth, canvasHeight, left, top } = options
  const mask = Buffer.alloc(canvasWidth * canvasHeight, 0)

  for (let y = 0; y < dishHeight; y += 1) {
    for (let x = 0; x < dishWidth; x += 1) {
      const srcIdx = (y * dishWidth + x) * 4 + 3
      const dstX = left + x
      const dstY = top + y
      if (dstX < 0 || dstY < 0 || dstX >= canvasWidth || dstY >= canvasHeight) {
        continue
      }
      const dstIdx = dstY * canvasWidth + dstX
      mask[dstIdx] = Math.max(mask[dstIdx], dishRgba[srcIdx] ?? 0)
    }
  }

  return mask
}

export async function enhanceDishWithLockedBackground(options: {
  dishImageData: string
  backgroundImageData: string
  userPrompt?: string
  orientation?: ImageOrientation
  sizePreset?: ImageSizePreset
}): Promise<{ dataUrl: string }> {
  const {
    dishImageData,
    backgroundImageData,
    userPrompt = '',
    orientation = 'landscape',
    sizePreset = 'medium',
  } = options

  console.log('[locked-background-hybrid] enhanceDishWithLockedBackground: orientation=%s, sizePreset=%s', orientation, sizePreset)
  const bgParsed = parseDataUrl(backgroundImageData)
  console.log('[locked-background-hybrid] background: mime=%s, base64Length=%d', bgParsed.mimeType, bgParsed.base64.length)
  const normalizedBg = await enforceImageDimensions(bgParsed.base64, orientation, sizePreset)
  const canvasWidth = normalizedBg.width
  const canvasHeight = normalizedBg.height
  const backgroundBuffer = Buffer.from(normalizedBg.base64, 'base64')
  console.log('[locked-background-hybrid] canvas: %dx%d', canvasWidth, canvasHeight)

  const dishCutout = await extractDishCutoutPng(dishImageData)
  // Closer framing: dish fills more of the frame (88% x 85% max) so the food is the clear subject, not distant.
  let targetDish = await sharp(dishCutout)
    .resize(Math.round(canvasWidth * 0.88), Math.round(canvasHeight * 0.85), {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .png()
    .toBuffer()

  // Very slight edge softening so the composite has no razor-sharp cutout line — helps the model blend naturally.
  targetDish = await sharp(targetDish).blur(0.35).png().toBuffer()

  const dishMeta = await sharp(targetDish).metadata()
  const dishWidth = dishMeta.width ?? Math.round(canvasWidth * 0.6)
  const dishHeight = dishMeta.height ?? Math.round(canvasHeight * 0.6)
  const centerOffsetX = Math.round(canvasWidth * 0.04)
  const left = Math.round((canvasWidth - dishWidth) / 2 + centerOffsetX)
  const top = Math.round(canvasHeight - dishHeight - canvasHeight * 0.06)

  const composedBase = await sharp(backgroundBuffer)
    .composite([{ input: targetDish, left, top }])
    .jpeg({ quality: 90 })
    .toBuffer()

  const composedBaseDataUrl = `data:image/jpeg;base64,${composedBase.toString('base64')}`
  const bgDataUrl = `data:image/jpeg;base64,${backgroundBuffer.toString('base64')}`

  const harmonizePrompt = [
    'TASK: Blend only. Do not generate or redraw anything.',
    'Image 1 = dish placed on background. Image 2 = reference background (unchanged).',
    'DO NOT change the food (ingredients, placement, bowl, arrangement). DO NOT change the background. You are not drawing a new image.',
    'ONLY do these three things: (1) Relight the food so its lighting and color temperature match the background — the food must look lit by the same light as the background. (2) Add or fix the shadow under the dish so it sits naturally on the surface. (3) Soften the edge where the dish meets the background so there is no cutout line.',
    'Output must be the same food on the same background with only lighting, shadow, and edge blend changed.',
    userPrompt.trim() ? `Note: ${userPrompt.trim()}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const composedParsed = parseDataUrl(composedBaseDataUrl)
  const bgRefParsed = parseDataUrl(bgDataUrl)
  console.log('[locked-background-hybrid] harmonize: composed base64Length=%d, bgRef base64Length=%d', composedParsed.base64.length, bgRefParsed.base64.length)

  const harmonized = await callGeminiImage(
    [
      { inlineData: { mimeType: composedParsed.mimeType, data: composedParsed.base64 } },
      { inlineData: { mimeType: bgRefParsed.mimeType, data: bgRefParsed.base64 } },
      { text: harmonizePrompt },
    ],
    { temperature: 0.08, topP: 0.72 }
  )
  console.log('[locked-background-hybrid] harmonize pass 1: got result base64Length=%d', harmonized.base64.length)

  // Second pass: again only lighting and blend — do not change food or background.
  const blendPrompt =
    'Do not redraw the food or the background. Only adjust: (1) lighting on the food to match the background so they look like one scene, (2) shadows under the dish, (3) the edge between dish and background so it is seamless. Same food, same background, same placement — only relight and blend.'
  let finalBase64 = harmonized.base64
  let finalMime = harmonized.mimeType
  try {
    const harmonized2 = await callGeminiImage(
      [
        { inlineData: { mimeType: harmonized.mimeType, data: harmonized.base64 } },
        { text: blendPrompt },
      ],
      { temperature: 0.1, topP: 0.7 }
    )
    console.log('[locked-background-hybrid] harmonize pass 2 (blend): got result base64Length=%d', harmonized2.base64.length)
    finalBase64 = harmonized2.base64
    finalMime = harmonized2.mimeType
  } catch (pass2Err) {
    console.warn('[locked-background-hybrid] second blend pass failed, using first harmonized result', pass2Err)
  }

  const harmonizedBuffer = await sharp(Buffer.from(finalBase64, 'base64'))
    .resize(canvasWidth, canvasHeight, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer()

  console.log('[locked-background-hybrid] returning double-harmonized image')
  return {
    dataUrl: `data:image/jpeg;base64,${harmonizedBuffer.toString('base64')}`,
  }
}

export async function composeDishOnLockedBackgroundStrict(options: {
  dishImageData: string
  backgroundImageData: string
  orientation?: ImageOrientation
  sizePreset?: ImageSizePreset
}): Promise<{ dataUrl: string }> {
  const {
    dishImageData,
    backgroundImageData,
    orientation = 'landscape',
    sizePreset = 'medium',
  } = options

  try {
    const bgParsed = parseDataUrl(backgroundImageData)
    const normalizedBg = await enforceImageDimensions(bgParsed.base64, orientation, sizePreset)
    const canvasWidth = normalizedBg.width
    const canvasHeight = normalizedBg.height
    const backgroundBuffer = Buffer.from(normalizedBg.base64, 'base64')

    const dishCutout = await extractDishCutoutPng(dishImageData)
    const targetDish = await sharp(dishCutout)
      .resize(Math.round(canvasWidth * 0.88), Math.round(canvasHeight * 0.85), {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .png()
      .toBuffer()

    const dishMeta = await sharp(targetDish).metadata()
    const dishWidth = dishMeta.width ?? Math.round(canvasWidth * 0.6)
    const dishHeight = dishMeta.height ?? Math.round(canvasHeight * 0.6)
    const centerOffsetX = Math.round(canvasWidth * 0.04)
    const left = Math.round((canvasWidth - dishWidth) / 2 + centerOffsetX)
    const top = Math.round(canvasHeight - dishHeight - canvasHeight * 0.06)

    const dishRaw = await sharp(targetDish).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const placedMask = createPlacedAlphaMask({
      dishRgba: dishRaw.data,
      dishWidth: dishRaw.info.width,
      dishHeight: dishRaw.info.height,
      canvasWidth,
      canvasHeight,
      left,
      top,
    })

    const placedCoverage =
      placedMask.reduce((sum, v) => sum + (v > 16 ? 1 : 0), 0) /
      Math.max(1, canvasWidth * canvasHeight)
    if (placedCoverage < 0.008) {
      throw new StrictBackgroundLockError(
        'Dish segmentation is too weak. Upload a clearer photo (single plate, plain surface, brighter light).',
        'SEGMENTATION_WEAK'
      )
    }

    const shadowOffsetX = Math.round(canvasWidth * 0.008)
    const shadowOffsetY = Math.round(canvasHeight * 0.015)
    const shadowMask = createPlacedAlphaMask({
      dishRgba: dishRaw.data,
      dishWidth: dishRaw.info.width,
      dishHeight: dishRaw.info.height,
      canvasWidth,
      canvasHeight,
      left: left + shadowOffsetX,
      top: top + shadowOffsetY,
    })
    const softShadowMask = await sharp(shadowMask, {
      raw: { width: canvasWidth, height: canvasHeight, channels: 1 },
    })
      .blur(14)
      .toBuffer()

    const shadowRgba = Buffer.alloc(canvasWidth * canvasHeight * 4)
    for (let i = 0; i < canvasWidth * canvasHeight; i += 1) {
      const alpha = Math.min(255, Math.round((softShadowMask[i] ?? 0) * 0.38))
      const idx = i * 4
      shadowRgba[idx] = 0
      shadowRgba[idx + 1] = 0
      shadowRgba[idx + 2] = 0
      shadowRgba[idx + 3] = alpha
    }

    const out = await sharp(backgroundBuffer)
      .composite([
        {
          input: shadowRgba,
          raw: { width: canvasWidth, height: canvasHeight, channels: 4 },
        },
        {
          input: targetDish,
          left,
          top,
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer()

    return {
      dataUrl: `data:image/jpeg;base64,${out.toString('base64')}`,
    }
  } catch (error) {
    if (error instanceof StrictBackgroundLockError) {
      throw error
    }
    throw new StrictBackgroundLockError(
      error instanceof Error ? error.message : 'Failed strict background compositing',
      'PROCESSING_FAILED'
    )
  }
}
