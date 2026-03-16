import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function normalizeType(value: unknown) {
  const candidate = String(value || 'OTHER').toUpperCase()
  return ['FOOD', 'DRINK', 'AMBIANCE', 'OTHER'].includes(candidate) ? candidate : 'OTHER'
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const existing = await prisma.mediaAsset.findFirst({
    where: { id: params.id, restaurantId: session.user.restaurantId },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
  }

  const updated = await prisma.mediaAsset.update({
    where: { id: params.id },
    data: {
      type: normalizeType(body.type),
      itemNameTag: String(body.itemNameTag || '').trim() || null,
      categoryTag: String(body.categoryTag || '').trim() || null,
    },
    include: {
      menuItems: {
        select: { id: true, name: true },
      },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.mediaAsset.findFirst({
    where: { id: params.id, restaurantId: session.user.restaurantId },
    include: { menuItems: { select: { id: true } } },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
  }

  await prisma.$transaction([
    prisma.menuItem.updateMany({
      where: { mediaAssetId: params.id, restaurantId: session.user.restaurantId },
      data: { mediaAssetId: null },
    }),
    prisma.mediaAsset.delete({
      where: { id: params.id },
    }),
  ])

  return NextResponse.json({ success: true, unlinkedCount: existing.menuItems.length })
}
