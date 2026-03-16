import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

export const dynamic = 'force-dynamic'

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

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      select: {
        storageKey: true,
        mimeType: true,
      },
    })

    if (!asset?.storageKey) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const bucket = process.env.AWS_S3_BUCKET_NAME
    if (!bucket) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })
    }

    const client = getS3Client()
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: asset.storageKey,
      })
    )

    if (!response.Body) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return new NextResponse(response.Body as ReadableStream, {
      headers: {
        'Content-Type': response.ContentType || asset.mimeType || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Media asset image proxy error:', error)
    return NextResponse.json({ error: 'Failed to load image' }, { status: 500 })
  }
}
