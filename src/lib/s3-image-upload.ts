import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024

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

export function parseImageData(imageData: string, maxSize = DEFAULT_MAX_SIZE) {
  if (!imageData) {
    throw new Error('No imageData provided')
  }

  let buffer: Buffer
  let contentType = 'image/jpeg'

  if (imageData.startsWith('data:')) {
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) throw new Error('Invalid data URL')
    contentType = match[1]
    buffer = Buffer.from(match[2], 'base64')
  } else {
    buffer = Buffer.from(imageData, 'base64')
  }

  if (buffer.length > maxSize) {
    throw new Error(`Image too large (max ${Math.round(maxSize / (1024 * 1024))}MB)`)
  }

  return { buffer, contentType }
}

export async function uploadImageBufferToS3({
  buffer,
  contentType,
  key,
}: {
  buffer: Buffer
  contentType: string
  key: string
}) {
  const bucket = process.env.AWS_S3_BUCKET_NAME
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET_NAME is not set')
  }

  const client = getS3Client()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )

  return {
    key,
    url: getPublicUrl(key),
  }
}

export function getImageExtension(contentType: string) {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  return 'jpg'
}
