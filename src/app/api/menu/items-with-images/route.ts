import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

export const dynamic = 'force-dynamic'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/menu/items-with-images
 * Returns IDs and list of menu items that have an image (for "apply background to all" and "apply to selected").
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const items = await prisma.menuItem.findMany({
      where: { restaurantId: session.user.restaurantId },
      select: { id: true, name: true, imageUrl: true },
    })
    const withImages = items.filter((i) => i.imageUrl != null && String(i.imageUrl).trim() !== '')
    const itemIds = withImages.map((i) => i.id)
    const itemList = withImages.map((i) => ({ id: i.id, name: i.name ?? '' }))

    return NextResponse.json({ itemIds, items: itemList })
  } catch (error) {
    console.error('Error listing items with images:', error)
    return NextResponse.json(
      { error: 'Failed to list menu items' },
      { status: 500 }
    )
  }
}
