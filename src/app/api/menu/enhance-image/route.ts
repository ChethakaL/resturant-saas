import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { enhanceDishImage } from '@/lib/enhance-dish-image'
import type { ImageOrientation, ImageSizePreset } from '@/lib/image-format'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      imageData,
      prompt,
      orientation = 'landscape',
      sizePreset = 'medium',
    }: {
      imageData?: string
      prompt?: string
      orientation?: ImageOrientation
      sizePreset?: ImageSizePreset
    } = await request.json()
    if (!imageData) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      )
    }

    const originalMime = imageData.includes(',')
      ? imageData.split(',')[0].split(':')[1].split(';')[0]
      : 'image/jpeg'

    const { dataUrl } = await enhanceDishImage({
      imageData,
      userPrompt: (prompt || '').trim(),
      orientation,
      sizePreset,
    })

    return NextResponse.json({
      success: true,
      imageUrl: dataUrl,
      originalMimeType: originalMime,
    })
  } catch (error) {
    console.error('Error enhancing image:', error)
    return NextResponse.json(
      {
        error: 'Failed to enhance image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
