import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supplierId = session.user.supplierId

    // Linked restaurants (from stock requests or manual link) — so dashboard/list/map show something
    const links = await prisma.restaurantSupplierLink.findMany({
      where: { supplierId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            city: true,
            address: true,
            lat: true,
            lng: true,
          },
        },
      },
    })

    // Menu items that use this supplier's products (via MenuItemIngredient.supplierProductId)
    const usage = await prisma.menuItemIngredient.findMany({
      where: {
        supplierProduct: { supplierId },
      },
      select: {
        menuItemId: true,
        menuItem: {
          select: { restaurantId: true, restaurant: true },
        },
      },
    })

    // Stock requests grouped by restaurantId for this supplier
    const stockRequestAgg = await prisma.stockRequest.groupBy({
      by: ['restaurantId'],
      where: { supplierId },
      _count: { id: true },
      _max: { createdAt: true },
    })

    // Build a lookup map: restaurantId -> { count, lastDate }
    const stockRequestMap = new Map<
      string,
      { count: number; lastDate: Date | null }
    >()
    for (const sr of stockRequestAgg) {
      stockRequestMap.set(sr.restaurantId, {
        count: sr._count.id,
        lastDate: sr._max.createdAt,
      })
    }

    const byRestaurant = new Map<
      string,
      { restaurant: { id: string; name: string; city: string | null; address: string | null; lat: number | null; lng: number | null }; menuItemIds: Set<string> }
    >()

    for (const link of links) {
      const r = link.restaurant
      if (!byRestaurant.has(r.id)) {
        byRestaurant.set(r.id, {
          restaurant: {
            id: r.id,
            name: r.name,
            city: r.city,
            address: r.address,
            lat: r.lat,
            lng: r.lng,
          },
          menuItemIds: new Set(),
        })
      }
    }
    for (const u of usage) {
      const rid = u.menuItem.restaurantId
      if (!byRestaurant.has(rid)) {
        byRestaurant.set(rid, {
          restaurant: {
            id: u.menuItem.restaurant.id,
            name: u.menuItem.restaurant.name,
            city: u.menuItem.restaurant.city,
            address: u.menuItem.restaurant.address,
            lat: u.menuItem.restaurant.lat,
            lng: u.menuItem.restaurant.lng,
          },
          menuItemIds: new Set(),
        })
      }
      byRestaurant.get(rid)!.menuItemIds.add(u.menuItemId)
    }

    const list = Array.from(byRestaurant.entries()).map(([restaurantId, data]) => {
      const srData = stockRequestMap.get(restaurantId)
      return {
        restaurantId,
        restaurantName: data.restaurant.name,
        city: data.restaurant.city,
        address: data.restaurant.address,
        lat: data.restaurant.lat,
        lng: data.restaurant.lng,
        menuItemsImpacted: data.menuItemIds.size,
        status: 'active' as const,
        lastStockRequestDate: srData?.lastDate?.toISOString() ?? null,
        stockRequestCount: srData?.count ?? 0,
      }
    })

    return NextResponse.json(list)
  } catch (error) {
    console.error('Supplier restaurants GET:', error)
    return NextResponse.json({ error: 'Failed to load restaurants' }, { status: 500 })
  }
}
