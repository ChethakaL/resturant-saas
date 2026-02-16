import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.type !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const customerId = session.user.id

  const sales = await prisma.sale.findMany({
    where: { customerId },
    include: {
      restaurant: { select: { id: true, name: true, slug: true, logo: true } },
      items: { include: { menuItem: { select: { id: true, name: true, price: true, imageUrl: true } } } },
    },
    orderBy: { timestamp: 'desc' },
  })

  const byRestaurant = new Map<
    string,
    {
      restaurant: { id: string; name: string; slug: string; logo: string | null }
      orderCount: number
      lastOrderAt: string
      itemCounts: Map<string, { menuItem: { id: string; name: string; price: number; imageUrl: string | null }; totalQuantity: number }>
    }
  >()

  for (const sale of sales) {
    const r = sale.restaurant
    const existing = byRestaurant.get(r.id)
    if (!existing) {
      byRestaurant.set(r.id, {
        restaurant: r,
        orderCount: 1,
        lastOrderAt: sale.timestamp.toISOString(),
        itemCounts: new Map(),
      })
    } else {
      existing.orderCount += 1
      if (new Date(sale.timestamp) > new Date(existing.lastOrderAt)) {
        existing.lastOrderAt = sale.timestamp.toISOString()
      }
    }
    const row = byRestaurant.get(r.id)!
    for (const si of sale.items) {
      const cur = row.itemCounts.get(si.menuItemId)
      if (!cur) {
        row.itemCounts.set(si.menuItemId, {
          menuItem: si.menuItem,
          totalQuantity: si.quantity,
        })
      } else {
        cur.totalQuantity += si.quantity
      }
    }
  }

  const visits = Array.from(byRestaurant.entries()).map(([restaurantId, v]) => ({
    restaurantId,
    restaurant: v.restaurant,
    orderCount: v.orderCount,
    lastOrderAt: v.lastOrderAt,
    recommendedItems: Array.from(v.itemCounts.entries())
      .map(([menuItemId, { menuItem, totalQuantity }]) => ({
        menuItemId,
        menuItem,
        totalQuantity,
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 8),
  }))

  return NextResponse.json({ visits })
}
