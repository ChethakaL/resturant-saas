import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getImageExtension, parseImageData, uploadImageBufferToS3 } from '@/lib/s3-image-upload'
import { classifyMediaAssetWithAI } from '@/lib/media-vision'

export const dynamic = 'force-dynamic'

function normalizeType(value: unknown) {
  const candidate = String(value || 'OTHER').toUpperCase()
  return ['FOOD', 'DRINK', 'AMBIANCE', 'OTHER'].includes(candidate) ? candidate : 'OTHER'
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const type = searchParams.get('type')
  const query = searchParams.get('q')?.trim()

  const assets = await prisma.mediaAsset.findMany({
    where: {
      restaurantId: session.user.restaurantId,
      ...(type && ['FOOD', 'DRINK', 'AMBIANCE', 'OTHER'].includes(type) ? { type } : {}),
      ...(query
        ? {
            OR: [
              { itemNameTag: { contains: query, mode: 'insensitive' } },
              { categoryTag: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      menuItems: {
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    assets.map((asset) => ({
      ...asset,
      previewUrl: `/api/media-assets/${asset.id}/image`,
    }))
  )
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const uploads = Array.isArray(body.assets) ? body.assets : []

    if (uploads.length === 0) {
      return NextResponse.json({ error: 'No assets provided' }, { status: 400 })
    }

    const created = await Promise.all(
      uploads.map(async (asset: Record<string, unknown>, index: number) => {
        const imageData = String(asset.imageData || '')
        const fileName = String(asset.fileName || asset.itemNameTag || '').trim() || undefined
        const { buffer, contentType } = parseImageData(String(asset.imageData || ''))
        const ext = getImageExtension(contentType)
        const key = `media-library/${session.user.restaurantId}/${Date.now()}-${index}.${ext}`
        const uploaded = await uploadImageBufferToS3({ buffer, contentType, key })
        const aiClassification = await classifyMediaAssetWithAI(imageData, fileName)
        const itemNameTag = String(asset.itemNameTag || '').trim() || aiClassification?.itemNameTag || null
        const categoryTag = String(asset.categoryTag || '').trim() || aiClassification?.categoryTag || null
        const requestedType = String(asset.type || '').trim()
        const normalizedType = requestedType
          ? normalizeType(requestedType)
          : aiClassification?.type || 'OTHER'

        const createdAsset = await prisma.mediaAsset.create({
          data: {
            restaurantId: session.user.restaurantId,
            url: uploaded.url,
            storageKey: uploaded.key,
            mimeType: contentType,
            type: normalizedType,
            itemNameTag,
            categoryTag,
          },
          include: {
            menuItems: {
              select: { id: true, name: true },
            },
          },
        })

        return {
          ...createdAsset,
          previewUrl: `/api/media-assets/${createdAsset.id}/image`,
        }
      })
    )

    return NextResponse.json(created)
  } catch (error) {
    console.error('Media asset upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload media assets' },
      { status: 500 }
    )
  }
}
