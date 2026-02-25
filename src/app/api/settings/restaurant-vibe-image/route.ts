import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

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
 * GET: stream the restaurant vibe image from S3 (bucket can stay private).
 * Query: key = S3 object key. Key must start with restaurant-vibe/{restaurantId}/.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const key = request.nextUrl.searchParams.get('key')
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    }

    const prefix = `restaurant-vibe/${session.user.restaurantId}/`
    if (!key.startsWith(prefix)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const bucket = process.env.AWS_S3_BUCKET_NAME
    if (!bucket) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })
    }

    const client = getS3Client()
    const command = new GetObjectCommand({ Bucket: bucket, Key: key })
    const response = await client.send(command)

    if (!response.Body) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const contentType = response.ContentType || 'image/jpeg'
    return new NextResponse(response.Body as any, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Restaurant vibe image proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to load image' },
      { status: 500 }
    )
  }
}
