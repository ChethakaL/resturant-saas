import sharp from 'sharp'

/**
 * Adds a soft, dark contact shadow in the lower-center of a dish image so the plate
 * looks grounded on a surface instead of floating. Uses a blurred elliptical shadow
 * typical of a plate resting on a table.
 */
export async function addContactShadow(inputBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(inputBuffer).metadata()
  const w = meta.width ?? 800
  const h = meta.height ?? 600

  // Ellipse in lower-center (where a plate usually sits in menu photos)
  const cx = w / 2
  const cy = h * 0.78
  const rx = w * 0.38
  const ry = h * 0.2
  const soft = Math.max(rx, ry) * 0.6 // falloff distance outside ellipse
  const maxAlpha = 72

  const shadowRgba = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      const d = Math.sqrt(dx * dx + dy * dy)
      const t = Math.max(0, 1 - (d - 1) / (soft / Math.min(rx, ry)))
      const alpha = Math.round(maxAlpha * Math.min(1, t))
      const i = (y * w + x) * 4
      shadowRgba[i] = 0
      shadowRgba[i + 1] = 0
      shadowRgba[i + 2] = 0
      shadowRgba[i + 3] = alpha
    }
  }

  const blurredShadow = await sharp(shadowRgba, {
    raw: { width: w, height: h, channels: 4 },
  })
    .blur(22)
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = await sharp(inputBuffer)
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from(blurredShadow.data),
        raw: { width: w, height: h, channels: 4 },
      },
    ])
    .removeAlpha()
    .jpeg({ quality: 90 })
    .toBuffer()

  return out
}
