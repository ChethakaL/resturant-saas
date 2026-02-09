import { getServerSession } from 'next-auth'

export const dynamic = 'force-dynamic'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supplierId = session.user.supplierId

    const [menuItemIdsRows, restaurantIdsRows, byProduct] = await Promise.all([
      prisma.menuItemIngredient.findMany({
        where: { supplierProduct: { supplierId } },
        select: { menuItemId: true },
      }),
      prisma.menuItemIngredient.findMany({
        where: { supplierProduct: { supplierId } },
        select: { menuItem: { select: { restaurantId: true } } },
      }),
      prisma.menuItemIngredient.groupBy({
        by: ['supplierProductId'],
        where: { supplierProductId: { not: null }, supplierProduct: { supplierId } },
        _count: { menuItemId: true },
      }),
    ])

    const menuItemsUsingCount = new Set(menuItemIdsRows.map((r) => r.menuItemId)).size
    const restaurantsCount = new Set(restaurantIdsRows.map((r) => r.menuItem.restaurantId)).size

    const productIds = byProduct.map((p) => p.supplierProductId).filter(Boolean) as string[]
    const productNames = productIds.length
      ? await prisma.supplierProduct.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        }).then((list) => Object.fromEntries(list.map((p) => [p.id, p.name])))
      : {}

    const topIngredients = byProduct
      .map((p) => ({
        supplierProductId: p.supplierProductId,
        name: productNames[p.supplierProductId!] ?? 'Unknown',
        menuItemCount: p._count.menuItemId,
      }))
      .sort((a, b) => b.menuItemCount - a.menuItemCount)
      .slice(0, 10)

    return NextResponse.json({
      menuItemsUsingYourIngredients: menuItemsUsingCount,
      restaurantsUsingYourIngredients: restaurantsCount,
      topIngredientsByRecipeUsage: topIngredients,
    })
  } catch (error) {
    console.error('Supplier analytics GET:', error)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}
