import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const MAX_FILE_SIZE = 50 * 1024 * 1024
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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 })
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

    // 2. Base64 for OpenAI
    const base64Image = buffer.toString('base64')
    const imageDataUrl = `data:${file.type};base64,${base64Image}`

    // 3. Improved prompt + structured output
    const openai = new OpenAI({ apiKey })

    const prompt = `
You are a precise receipt OCR and data extraction assistant. Analyze the receipt image carefully.

Extract ONLY real visible information — do NOT hallucinate or invent values.

Output strictly as JSON matching this exact schema:

{
  "supplier": string | null,              // store/supplier name
  "date": string | null,                  // YYYY-MM-DD format if possible
  "totalAmount": number | null,           // final total paid
  "currency": string | null,              // e.g. "IQD", "USD"
  "items": array of objects, each:
    {
      "name": string,                     // ingredient/product name
      "brand": string | null,
      "quantity": number | null,
      "unit": string | null,              // e.g. "kg", "g", "L", "piece", "pack"
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
- Handle Arabic/English mix — translate names to English if possible, but keep original if unclear
- Return ONLY valid JSON — nothing else.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful, precise JSON-only receipt parser.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.1,               // low for consistency
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    })

    const rawContent = completion.choices[0]?.message?.content || '{}'
    let extractedData

    try {
      extractedData = JSON.parse(rawContent)
    } catch (e) {
      console.error('Invalid JSON from OpenAI:', rawContent)
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
    const receipt = await prisma.receipts.create({
      data: {
        restaurantId: session.user.restaurantId,
        imageUrl,
        extractedData, // Json type in Prisma
        status: 'PENDING',
        supplier: extractedData.supplier ?? null,
        totalAmount: extractedData.totalAmount ?? 0,
        date: extractedData.date ? new Date(extractedData.date) : null,
        // ingredientId: ingredientId || null,   // if you want to pre-link
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