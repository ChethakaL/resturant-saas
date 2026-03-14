import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB for receipts
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function getS3Client() {
  const region = process.env.AWS_S3_REGION
  const accessKey = process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!region || !accessKey || !secretKey) {
    throw new Error('AWS S3 is not configured')
  }
  return new S3Client({
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  })
}

function getPublicUrl(key: string): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME
  const region = process.env.AWS_S3_REGION
  if (!bucket || !region) throw new Error('AWS_S3_BUCKET_NAME and AWS_S3_REGION are required')
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
      return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const ingredientId = formData.get('ingredientId') as string | null

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64Image = buffer.toString('base64')
    const imageDataUrl = `data:${file.type};base64,${base64Image}`

    // 1. Upload to S3
    const bucket = process.env.AWS_S3_BUCKET_NAME
    if (!bucket) {
      return NextResponse.json({ error: 'AWS_S3_BUCKET_NAME is not set' }, { status: 500 })
    }

    const ext = file.type.split('/')[1]
    const key = `receipts/${session.user.restaurantId}/${Date.now()}.${ext}`
    const s3Client = getS3Client()
    
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    )
    const imageUrl = getPublicUrl(key)

    // 2. AI Parsing
    const openai = new OpenAI({ apiKey })
    const prompt = `
      Extract the following information from this receipt image in JSON format:
      - supplier: Name of the store or supplier
      - date: Date of the receipt (YYYY-MM-DD)
      - totalAmount: Total amount paid (as a Number, e.g., 40500)
      - items: Array of items, each with:
        - name: Name of the ingredient
        - brand: Brand name if available
        - quantity: Numerical quantity (as a Number, e.g., 5)
        - unit: Unit of measure (e.g., kg, g, L, ml, piece)
        - totalPrice: Total price for this item (as a Number, e.g., 25000)
        - unitPrice: Price per unit (as a Number, e.g., 5000)
      
      IMPORTANT: All prices and quantities must be raw numbers, no currency symbols or commas.
      If the receipt is for a specific ingredient (ID provided: ${ingredientId || 'None'}), focus on that.
      Return ONLY the JSON.
    `

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const extractedData = JSON.parse(content)

    // Helper to parse price string to float (handles "40,500 IQD" -> 40500)
    const parsePrice = (price: any): number => {
      if (typeof price === 'number') return price
      if (!price) return 0
      const cleaned = String(price).replace(/[^0-9.-]+/g, '')
      return parseFloat(cleaned) || 0
    }

    // Clean up extracted data to ensure numeric types
    if (extractedData.totalAmount) {
      extractedData.totalAmount = parsePrice(extractedData.totalAmount)
    }
    if (Array.isArray(extractedData.items)) {
      extractedData.items = extractedData.items.map((item: any) => ({
        ...item,
        quantity: parsePrice(item.quantity),
        unitPrice: parsePrice(item.unitPrice),
        totalPrice: parsePrice(item.totalPrice),
      }))
    }

    // 3. Save Receipt record (Pending confirmation)
    const receipt = await (prisma as any).receipt.create({
      data: {
        restaurantId: session.user.restaurantId,
        imageUrl,
        extractedData: extractedData as any,
        status: 'PENDING',
        supplier: extractedData.supplier,
        totalAmount: extractedData.totalAmount || 0,
        date: extractedData.date ? new Date(extractedData.date) : null,
      },
    })

    return NextResponse.json({
      receiptId: receipt.id,
      imageUrl: receipt.imageUrl,
      extractedData,
    })
  } catch (error) {
    console.error('Receipt processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process receipt', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
