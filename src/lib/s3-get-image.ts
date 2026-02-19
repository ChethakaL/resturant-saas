import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

/**
 * If url is our S3 bucket (same bucket/region as in env), fetch the object
 * using AWS credentials and return buffer + contentType. Otherwise return null
 * so caller can use fetch().
 */
export async function getImageBufferFromS3IfOurs(
  url: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const bucket = process.env.AWS_S3_BUCKET_NAME
  const region = process.env.AWS_S3_REGION
  const accessKey = process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!bucket || !region || !accessKey || !secretKey) return null

  // Virtual-hosted: https://BUCKET.s3.REGION.amazonaws.com/KEY
  const vHostMatch = url.match(
    new RegExp(`^https://${bucket}\\.s3\\.${region}\\.amazonaws\\.com/(.+)$`, 'i')
  )
  if (vHostMatch) {
    const key = decodeURIComponent(vHostMatch[1])
    const client = new S3Client({
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    })
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    )
    const body = res.Body
    if (!body) throw new Error('Empty S3 object')
    const bytes = await body.transformToByteArray()
    const buffer = Buffer.from(bytes)
    const contentType = res.ContentType || 'image/jpeg'
    return { buffer, contentType }
  }

  // Path-style: https://s3.REGION.amazonaws.com/BUCKET/KEY
  const pathMatch = url.match(
    new RegExp(`^https://s3\\.${region}\\.amazonaws\\.com/${bucket}/(.+)$`, 'i')
  )
  if (pathMatch) {
    const key = decodeURIComponent(pathMatch[1])
    const client = new S3Client({
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    })
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    )
    const body = res.Body
    if (!body) throw new Error('Empty S3 object')
    const bytes = await body.transformToByteArray()
    const buffer = Buffer.from(bytes)
    const contentType = res.ContentType || 'image/jpeg'
    return { buffer, contentType }
  }

  return null
}
