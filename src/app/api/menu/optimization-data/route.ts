import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/menu/optimization-data
 * Returns showcases and menu items for the optimization tab. Used to defer this
 * heavy load until the user opens the "Optimize your menu sales" tab.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const restaurantId = session.user.restaurantId

  const [showcases, menuItems] = await Promise.all([
    prisma.menuShowcase.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            menuItem: {
              select: { id: true, name: true, imageUrl: true, price: true },
            },
          },
        },
      },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId, available: true },
      select: { id: true, name: true, imageUrl: true, price: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({
    showcases: JSON.parse(JSON.stringify(showcases)),
    menuItems,
  })
}
