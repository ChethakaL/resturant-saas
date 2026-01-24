import sharp from 'sharp'
import {
  ImageOrientation,
  ImageSizePreset,
  imageOrientationAspectRatios,
  imageSizeOptions,
} from '@/lib/image-format'

export interface ProcessedImage {
  base64: string
  mimeType: string
  width: number
  height: number
}

export async function enforceImageDimensions(
  base64Data: string,
  orientation: ImageOrientation,
  sizePreset: ImageSizePreset
): Promise<ProcessedImage> {
  const sizeOption =
    imageSizeOptions.find((option) => option.value === sizePreset) ??
    imageSizeOptions[1]
  const ratio =
    imageOrientationAspectRatios[orientation] ??
    imageOrientationAspectRatios.landscape

  const targetMax = sizeOption.pixels
  let width: number
  let height: number

  if (ratio >= 1) {
    width = targetMax
    height = Math.max(1, Math.round(width / ratio))
  } else {
    height = targetMax
    width = Math.max(1, Math.round(height * ratio))
  }

  const buffer = Buffer.from(base64Data, 'base64')
  const processed = sharp(buffer).resize(width, height, {
    fit: 'cover',
    position: 'centre',
  })

  const optimizedBuffer = await processed.jpeg({ quality: 85 }).toBuffer()

  return {
    base64: optimizedBuffer.toString('base64'),
    mimeType: 'image/jpeg',
    width,
    height,
  }
}
