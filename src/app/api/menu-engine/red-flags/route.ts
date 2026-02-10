import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface RedFlagResult {
  identicalDescriptionLength: Array<{ length: number; itemIds: string[]; names: string[] }>
  equalVisualWeight: Array<{ categoryId: string; categoryName: string; itemIds: string[]; names: string[] }>
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const items = await prisma.menuItem.findMany({
      where: { restaurantId: session.user.restaurantId, status: 'ACTIVE' },
      select: { id: true, name: true, description: true, imageUrl: true, categoryId: true, category: { select: { name: true } } },
    })

    const byDescLength = new Map<number, { id: string; name: string }[]>()
    for (const item of items) {
      const len = (item.description ?? '').trim().length
      if (len === 0) continue
      const list = byDescLength.get(len) ?? []
      list.push({ id: item.id, name: item.name })
      byDescLength.set(len, list)
    }
    const identicalDescriptionLength = [...byDescLength.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([length, list]) => ({ length, itemIds: list.map((x) => x.id), names: list.map((x) => x.name) }))

    const byCategory = new Map<string, typeof items>()
    for (const item of items) {
      const catId = item.categoryId ?? 'uncategorized'
      const list = byCategory.get(catId) ?? []
      list.push(item)
      byCategory.set(catId, list)
    }
    const equalVisualWeight: RedFlagResult['equalVisualWeight'] = []
    for (const [categoryId, catItems] of byCategory) {
      const hasImage = catItems.filter((i) => i.imageUrl)
      const noImage = catItems.filter((i) => !i.imageUrl)
      if (hasImage.length > 0 && noImage.length > 0) continue
      if (catItems.length < 2) continue
      const allSame = hasImage.length === catItems.length || noImage.length === catItems.length
      if (allSame) {
        equalVisualWeight.push({
          categoryId,
          categoryName: catItems[0]?.category?.name ?? '',
          itemIds: catItems.map((i) => i.id),
          names: catItems.map((i) => i.name),
        })
      }
    }

    return NextResponse.json({
      identicalDescriptionLength,
      equalVisualWeight,
    } as RedFlagResult)
  } catch (error) {
    console.error('Red flags error:', error)
    return NextResponse.json({ error: 'Failed to compute red flags' }, { status: 500 })
  }
}
