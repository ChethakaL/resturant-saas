import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Returns all active supplier products available to the restaurant
 * (from linked suppliers or any supplier with matching global ingredients).
 * Each product includes current active price and unit cost (price / packSize).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurantId = session.user.restaurantId

    // Get all suppliers linked to this restaurant
    const links = await prisma.restaurantSupplierLink.findMany({
      where: { restaurantId },
      select: { supplierId: true },
    })
    const supplierIds = links.map((l) => l.supplierId)

    if (supplierIds.length === 0) {
      return NextResponse.json([])
    }

    // Get all active products from linked suppliers with their current price
    const products = await prisma.supplierProduct.findMany({
      where: {
        supplierId: { in: supplierIds },
        isActive: true,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        prices: {
          where: {
            effectiveFrom: { lte: new Date() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    })

    // Compute unit cost for each product
    const result = products.map((p) => {
      const activePrice = p.prices[0]
      const unitCost = activePrice && p.packSize > 0
        ? activePrice.price / p.packSize
        : 0
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        packSize: p.packSize,
        packUnit: p.packUnit,
        brand: p.brand,
        supplierName: p.supplier.name,
        supplierId: p.supplier.id,
        price: activePrice?.price ?? null,
        currency: activePrice?.currency ?? 'IQD',
        unitCost,
        globalIngredientId: p.globalIngredientId,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Recipe supplier products GET:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
