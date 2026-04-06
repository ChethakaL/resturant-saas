import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_CLAUDE_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
function getS3Client() {
  const region = process.env.AWS_S3_REGION
  const accessKey = process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!region || !accessKey || !secretKey) {
    throw new Error('AWS S3 credentials missing')
  }
  return new S3Client({
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  })
}

function getPublicUrl(key: string): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME
  const region = process.env.AWS_S3_REGION
  if (!bucket || !region) throw new Error('AWS_S3_BUCKET_NAME / REGION missing')
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

async function buildVisionPayload(
  buffer: Buffer,
  contentType: string
): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  let workingBuffer = buffer
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' =
    contentType === 'image/png' || contentType === 'image/webp' ? contentType : 'image/jpeg'

  if (workingBuffer.byteLength <= MAX_CLAUDE_IMAGE_BYTES) {
    return { data: workingBuffer.toString('base64'), mediaType }
  }

  const widths = [2200, 1800, 1440, 1200, 960]
  const qualities = [82, 72, 62, 52, 42]

  for (const width of widths) {
    for (const quality of qualities) {
      const candidate = await sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

      if (candidate.byteLength <= MAX_CLAUDE_IMAGE_BYTES) {
        return {
          data: candidate.toString('base64'),
          mediaType: 'image/jpeg',
        }
      }
    }
  }

  const fallback = await sharp(buffer)
    .rotate()
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 38, mozjpeg: true })
    .toBuffer()

  return {
    data: fallback.toString('base64'),
    mediaType: 'image/jpeg',
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic not configured' }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const ingredientId = formData.get('ingredientId') as string | null // optional

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No valid file uploaded' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP allowed' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.type.split('/')[1] || 'jpg'
    const key = `receipts/${session.user.restaurantId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`

    // 1. Upload to S3
    const s3 = getS3Client()
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    )
    const imageUrl = getPublicUrl(key)

    // 2. Prepare image for Claude vision, compressing when needed to fit its 5 MB limit.
    const { data: base64Image, mediaType } = await buildVisionPayload(buffer, file.type)

    // 3. Improved multilingual prompt + structured output
    const anthropic = new Anthropic({ apiKey })

    const prompt = `
You are a precise multilingual receipt and invoice OCR extraction assistant. Analyze the uploaded receipt image carefully.

Extract ONLY real visible information — do NOT hallucinate or invent values.

Output strictly as JSON matching this exact schema:

{
  "supplier": string | null,              // store/supplier name
  "date": string | null,                  // YYYY-MM-DD format if possible
  "totalAmount": number | null,           // final total paid
  "currency": string | null,              // e.g. "IQD", "USD"
  "items": array of objects, each:
    {
      "name": string,                     // product line as printed (Arabic/Kurdish/Latin); see brand rules below
      "brand": string | null,             // optional: standard Latin spelling when the line clearly shows a global food brand
      "quantity": number | null,
      "unit": string | null,              // e.g. "kg", "g", "L", "piece", "pack" — as printed
      "unitPrice": number | null,
      "totalPrice": number | null
    }
}

Rules:
- Prices & quantities as raw numbers (no commas, no "IQD", no symbols)
- If currency appears (e.g. IQD), set "currency" field
- If ingredientId is provided (${ingredientId || 'none'}), prioritize/must include the matching or most relevant item for that ingredient
- If multiple items, include all, but the first should be the most likely main purchase
- If field is missing/unreadable → use null
- Handle Arabic, Kurdish, English, and mixed-language receipts or invoices
- Read tabular invoices carefully: quantity, unit price, total price, and product description may be in separate columns
- **Latin OCR:** When Latin letters are visible on the line, transcribe them character-by-character. Do not substitute a different word that "sounds similar" — wrong brand spellings are unacceptable. If Latin text is too blurry to read, use null for brand rather than guessing.
- **Brand field:** If the line clearly shows a major international food brand (e.g. Nestlé, Kinder, Oreo, Milka, Doritos, Pepsi, Coca-Cola) in Latin or an unmistakable logo context, set "brand" to the standard international spelling. Put the full product description in "name" as printed (Arabic text, nicknames, sizes); you may repeat the brand in "name" if it appears there. If no clear global brand, use null for brand.
- **No translation:** Do NOT translate supplier, names, or units into another language — transcribe only.
- Preserve each line item distinctly. Do not reuse the same generic name for multiple different rows unless the printed text is actually the same
- For each item name, copy the printed line text verbatim. If uncertain, prefer partial legible text over invention
- Do not collapse multiple different products into generic labels like "oil", "biscuit", or "chocolate wafer" unless the printed line clearly says that exact thing
- If the line contains pack-size notation like 24x24 or 52x15, do NOT put that notation in the item name. Keep the product name separate from pack/count notation
- Return ONLY valid JSON — nothing else.
`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1800,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
      temperature: 0,
    })

    const rawContent = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    let extractedData

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      extractedData = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent || '{}')
    } catch (e) {
      console.error('Invalid JSON from Claude:', rawContent)
      return NextResponse.json({ error: 'Failed to parse receipt data' }, { status: 500 })
    }

    // 4. Clean/norm numbers (extra safety)
    const cleanNum = (val: any): number | null => {
      if (val == null) return null
      if (typeof val === 'number') return val
      const str = String(val).replace(/[^0-9.-]/g, '')
      const num = parseFloat(str)
      return isNaN(num) ? null : num
    }

    extractedData.totalAmount = cleanNum(extractedData.totalAmount)
    extractedData.items = (extractedData.items || []).map((item: any) => ({
      ...item,
      quantity: cleanNum(item.quantity),
      unitPrice: cleanNum(item.unitPrice),
      totalPrice: cleanNum(item.totalPrice),
    }))

    // 5. Save pending receipt
    const receipt = await prisma.receipt.create({
      data: {
        restaurantId: session.user.restaurantId,
        imageUrl,
        extractedData,
        status: 'PENDING',
        supplier: extractedData.supplier ?? null,
        totalAmount: extractedData.totalAmount ?? 0,
        date: extractedData.date ? new Date(extractedData.date) : null,
      },
    })

    return NextResponse.json({
      receiptId: receipt.id,
      imageUrl,
      extractedData,
    })
  } catch (error) {
    console.error('Receipt upload/processing failed:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Processing failed', details: msg }, { status: 500 })
  }
}
