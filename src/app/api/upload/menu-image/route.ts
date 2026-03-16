import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getImageExtension, parseImageData, uploadImageBufferToS3 } from '@/lib/s3-image-upload'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    let imageData = typeof body.imageData === 'string' ? body.imageData : ''
    const { buffer, contentType } = parseImageData(imageData)
    const ext = getImageExtension(contentType)
    const key = `menu-items/${session.user.restaurantId}/${Date.now()}.${ext}`
    const { url } = await uploadImageBufferToS3({ buffer, contentType, key })
    return NextResponse.json({ url })
  } catch (error) {
    console.error('Menu image upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload image', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
