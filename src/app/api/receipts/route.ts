import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { callGeminiWithImage, getReceiptVisionModel, parseGeminiJson } from '@/lib/generative'
import {
  normalizeReceiptManagementLocale,
  translateReceiptStringsToLocale,
} from '@/lib/i18n/receipt-translate'

const MAX_FILE_SIZE = 50 * 1024 * 1024
/** Keep vision inputs small to reduce Gemini image-token cost */
const MAX_VISION_IMAGE_BYTES = 5 * 1024 * 1024
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

/** Handles YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY (common on Iraqi receipts). Returns null if invalid. */
function parseReceiptDateValue(input: unknown): Date | null {
  if (input == null || input === '') return null
  const s = String(input).trim()
  if (!s) return null

  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }

  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2]) - 1
    const year = Number(dmy[3])
    const d = new Date(year, month, day)
    if (
      d.getFullYear() === year &&
      d.getMonth() === month &&
      d.getDate() === day
    ) {
      return d
    }
  }

  const fallback = new Date(s)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

/**
 * Verbatim OCR only (like “what text is in this image?”). Translation to the dashboard language is a separate step.
 * Combining OCR + English in one call caused row mixing and invented names (e.g. wrong line for Nestlé vs Milka).
 */
function buildGeminiReceiptOcrPrompt(ingredientId: string | null): string {
  return `You are reading a wholesale FOOD receipt or invoice PHOTO. Return ONE JSON object only — no markdown, no commentary.

Task: **Transcribe** what is printed. Do **not** translate Arabic into English in this JSON. Arabic product lines stay Arabic; Latin brand text stays as printed.

Schema:
{
  "supplier": string | null,
  "date": string | null,
  "totalAmount": number | null,
  "currency": string | null,
  "items": [
    {
      "name": string,
      "brand": string | null,
      "quantity": number | null,
      "unit": string | null,
      "unitPrice": number | null,
      "totalPrice": number | null
    }
  ]
}

**Row integrity (critical):** Read the line-item TABLE from top to bottom. Each JSON object must match **exactly one** printed table row. The "name", "quantity", "unitPrice", and "totalPrice" for that object must all come from the **same** row — never attach numbers from one row to the product name of another row.

- "name" = product/description column text only, exactly as printed (often Arabic).
- "brand" = Latin brand on that line if clearly separate; else null.
- **date:** Output **YYYY-MM-DD** only. If the receipt shows 18-12-2023, return "2023-12-18" (use the year printed on the document).
- Numeric fields: digits only (no commas, no IQD inside numbers).
- Unreadable: null.
- Optional row to emphasize if present in image: ingredientId hint = ${ingredientId || 'none'}

Do not use the document title "فاتورة مبيعات" as supplier unless a real vendor name is not visible.`
}

async function buildVisionPayload(
  buffer: Buffer,
  contentType: string
): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  let workingBuffer = buffer
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' =
    contentType === 'image/png' || contentType === 'image/webp' ? contentType : 'image/jpeg'

  if (workingBuffer.byteLength <= MAX_VISION_IMAGE_BYTES) {
    return { data: workingBuffer.toString('base64'), mediaType }
  }

  const widths = [2400, 2200, 1800, 1440, 1200, 960]
  const qualities = [88, 82, 72, 62, 52, 42]

  for (const width of widths) {
    for (const quality of qualities) {
      const candidate = await sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

      if (candidate.byteLength <= MAX_VISION_IMAGE_BYTES) {
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

    const googleKey = process.env.GOOGLE_AI_KEY
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!googleKey && !anthropicKey) {
      return NextResponse.json(
        { error: 'Configure GOOGLE_AI_KEY (recommended) or ANTHROPIC_API_KEY' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const ingredientId = formData.get('ingredientId') as string | null // optional
    const managementLocale = normalizeReceiptManagementLocale(
      String(formData.get('managementLocale') || 'en')
    )

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

    // 2. Prepare image (compress to cap size) — keeps Gemini image-token cost down
    const { data: base64Image, mediaType } = await buildVisionPayload(buffer, file.type)

    // 3. Gemini: verbatim OCR in one multimodal call, then text-only translation (matches web “read image, then translate” quality).
    let extractedData: any = null

    if (googleKey) {
      try {
        const geminiPrompt = buildGeminiReceiptOcrPrompt(ingredientId)
        const geminiResult = await callGeminiWithImage({
          base64: base64Image,
          mimeType: mediaType,
          prompt: geminiPrompt,
          maxOutputTokens: 8192,
          model: getReceiptVisionModel(),
        })
        const rawText = geminiResult.response.text()
        extractedData = parseGeminiJson(rawText)
      } catch (e) {
        console.warn('[receipts] Gemini vision extraction failed', e)
      }
    }

    if (!extractedData && anthropicKey) {
      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const prompt = `
You are a precise multilingual receipt and invoice OCR extraction assistant. Analyze the uploaded receipt image carefully.

Extract ONLY real visible information — do NOT hallucinate or invent values.

Output strictly as JSON matching this exact schema:

{
  "supplier": string | null,
  "date": string | null,
  "totalAmount": number | null,
  "currency": string | null,
  "items": array of objects, each:
    {
      "name": string,
      "brand": string | null,
      "quantity": number | null,
      "unit": string | null,
      "unitPrice": number | null,
      "totalPrice": number | null
    }
}

Rules:
- **date:** use YYYY-MM-DD only (if receipt shows 18-12-2025 use "2025-12-18")
- Prices & quantities as raw numbers (no commas, no "IQD", no symbols)
- If currency appears (e.g. IQD), set "currency" field
- If ingredientId is provided (${ingredientId || 'none'}), prioritize/must include the matching or most relevant item for that ingredient
- If multiple items, include all, but the first should be the most likely main purchase
- If field is missing/unreadable → use null
- **Transcribe text as printed**; the server will translate to the dashboard language after extraction.
- Read tabular invoices carefully: quantity, unit price, total price, and product description may be in separate columns
- Latin OCR: transcribe Latin brand names carefully; use null for brand if unclear
- Return ONLY valid JSON — nothing else.
`

      try {
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
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
        extractedData = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent || '{}')
      } catch (e) {
        console.error('Invalid JSON from Claude:', e)
        return NextResponse.json({ error: 'Failed to parse receipt data' }, { status: 500 })
      }
    }

    if (!extractedData) {
      return NextResponse.json(
        { error: 'Failed to extract receipt data. Check GOOGLE_AI_KEY or ANTHROPIC_API_KEY.' },
        { status: 500 }
      )
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

    // 5. Translate verbatim OCR to dashboard language (Gemini text + cache; same for Claude and Gemini vision paths)
    const toTranslate: string[] = []
    if (typeof extractedData.supplier === 'string' && extractedData.supplier.trim()) {
      toTranslate.push(extractedData.supplier)
    }
    for (const it of extractedData.items || []) {
      if (it?.name) toTranslate.push(String(it.name))
      if (it?.brand) toTranslate.push(String(it.brand))
      if (it?.unit) toTranslate.push(String(it.unit))
    }

    if (toTranslate.length > 0) {
      try {
        const translated = await translateReceiptStringsToLocale(toTranslate, managementLocale)
        let c = 0
        if (typeof extractedData.supplier === 'string' && extractedData.supplier.trim()) {
          extractedData.supplier = translated[c++]!
        }
        for (const it of extractedData.items || []) {
          if (it?.name) it.name = translated[c++]!
          if (it?.brand) it.brand = translated[c++]!
          if (it?.unit) it.unit = translated[c++]!
        }
      } catch (e) {
        console.warn('[receipts] management locale translation failed', e)
      }
    }

    const receiptDate = parseReceiptDateValue(extractedData.date)
    extractedData.date = receiptDate ? receiptDate.toISOString().slice(0, 10) : null

    // 6. Save pending receipt (no inventory changes until user confirms in /api/receipts/confirm)
    const receipt = await prisma.receipt.create({
      data: {
        restaurantId: session.user.restaurantId,
        imageUrl,
        extractedData,
        status: 'PENDING',
        supplier: extractedData.supplier ?? null,
        totalAmount: extractedData.totalAmount ?? 0,
        date: receiptDate,
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
