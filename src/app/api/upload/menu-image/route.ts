import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB for dish photos

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

    const body = await request.json()
    let imageData = typeof body.imageData === 'string' ? body.imageData : ''
    if (!imageData) {
      return NextResponse.json({ error: 'No imageData provided' }, { status: 400 })
    }

    let buffer: Buffer
    let mimeType = 'image/jpeg'
    if (imageData.startsWith('data:')) {
      const match = imageData.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 })
      }
      mimeType = match[1].split('/')[1]?.includes('png') ? 'image/png' : 'image/jpeg'
      buffer = Buffer.from(match[2], 'base64')
    } else {
      buffer = Buffer.from(imageData, 'base64')
    }
    if (buffer.length > MAX_SIZE) {
      return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 })
    }

    const bucket = process.env.AWS_S3_BUCKET_NAME
    if (!bucket) {
      return NextResponse.json({ error: 'AWS_S3_BUCKET_NAME is not set' }, { status: 500 })
    }

    const ext = mimeType === 'image/png' ? 'png' : 'jpg'
    const key = `menu-items/${session.user.restaurantId}/${Date.now()}.${ext}`
    const client = getS3Client()
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    )
    const url = getPublicUrl(key)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('Menu image upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload image', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
