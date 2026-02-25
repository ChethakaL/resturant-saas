import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

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

/**
 * Upload a restaurant photo for "vibe" (display only; not used by AI).
 * Boss: "If they think their restaurant's image is contributing to the custom design they'll feel cool."
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('image') as File | null
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided. Use form field "image".' },
        { status: 400 }
      )
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use JPEG, PNG, WebP, or GIF.' },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum 5MB.' },
        { status: 400 }
      )
    }

    const bucket = process.env.AWS_S3_BUCKET_NAME
    if (!bucket) {
      return NextResponse.json(
        { error: 'AWS_S3_BUCKET_NAME is not set' },
        { status: 500 }
      )
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 80)
    const key = `restaurant-vibe/${session.user.restaurantId}/${Date.now()}-${safeName}`

    const client = getS3Client()
    const buffer = Buffer.from(await file.arrayBuffer())

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    )
    console.log('[restaurant-vibe] Upload OK:', { bucket, region: process.env.AWS_S3_REGION, key })
    return NextResponse.json({ url: `/api/settings/restaurant-vibe-image?key=${encodeURIComponent(key)}`, key })
  } catch (error) {
    console.error('Restaurant vibe image upload error:', error)
    return NextResponse.json(
      {
        error: 'Failed to upload image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
