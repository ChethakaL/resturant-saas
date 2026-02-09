import { getServerSession } from 'next-auth'

export const dynamic = 'force-dynamic'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supplierId = session.user.supplierId

    // Parse query params
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '90', 10)
    const restaurantId = searchParams.get('restaurantId') || undefined

    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - days)

    // Build the menuItemIngredient where clause
    const ingredientWhere: Record<string, unknown> = {
      supplierProduct: { supplierId },
    }
    if (restaurantId) {
      ingredientWhere.menuItem = { restaurantId }
    }

    // Build the stockRequest trend where clause (always last 6 months for trend)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    sixMonthsAgo.setDate(1)
    sixMonthsAgo.setHours(0, 0, 0, 0)

    const trendWhere: Record<string, unknown> = {
      supplierId,
      createdAt: { gte: sixMonthsAgo },
    }
    if (restaurantId) {
      trendWhere.restaurantId = restaurantId
    }

    const [menuItemRows, byProduct, trendRows] = await Promise.all([
      // Menu item + restaurant data for stat cards and topRestaurants
      prisma.menuItemIngredient.findMany({
        where: ingredientWhere,
        select: {
          menuItemId: true,
          menuItem: {
            select: {
              restaurantId: true,
              restaurant: { select: { id: true, name: true } },
            },
          },
        },
      }),
      // Group by supplierProduct for top ingredients
      prisma.menuItemIngredient.groupBy({
        by: ['supplierProductId'],
        where: {
          supplierProductId: { not: null },
          ...ingredientWhere,
        },
        _count: { menuItemId: true },
      }),
      // Stock requests for trend (last 6 months)
      prisma.stockRequest.findMany({
        where: trendWhere,
        select: { createdAt: true },
      }),
    ])

    // --- Stat cards ---
    const menuItemsUsingCount = new Set(menuItemRows.map((r) => r.menuItemId)).size
    const restaurantsCount = new Set(
      menuItemRows.map((r) => r.menuItem.restaurantId)
    ).size

    // --- Top ingredients by recipe usage ---
    const productIds = byProduct
      .map((p) => p.supplierProductId)
      .filter(Boolean) as string[]
    const productNames = productIds.length
      ? await prisma.supplierProduct
          .findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          })
          .then((list) => Object.fromEntries(list.map((p) => [p.id, p.name])))
      : {}

    const topIngredients = byProduct
      .map((p) => ({
        supplierProductId: p.supplierProductId,
        name: productNames[p.supplierProductId!] ?? 'Unknown',
        menuItemCount: p._count.menuItemId,
      }))
      .sort((a, b) => b.menuItemCount - a.menuItemCount)
      .slice(0, 10)

    // --- Stock request trend (last 6 months, grouped by month) ---
    const monthBuckets: { month: string; count: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
      monthBuckets.push({ month: label, count: 0 })
    }

    for (const sr of trendRows) {
      const d = new Date(sr.createdAt)
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
      const bucket = monthBuckets.find((b) => b.month === label)
      if (bucket) bucket.count++
    }

    // --- Top restaurants by menu item count ---
    const topRestMap = new Map<
      string,
      { restaurantId: string; name: string; menuItemIds: Set<string> }
    >()

    for (const row of menuItemRows) {
      const rid = row.menuItem.restaurantId
      const rName = row.menuItem.restaurant.name
      if (!topRestMap.has(rid)) {
        topRestMap.set(rid, {
          restaurantId: rid,
          name: rName,
          menuItemIds: new Set(),
        })
      }
      topRestMap.get(rid)!.menuItemIds.add(row.menuItemId)
    }

    const topRestaurants = Array.from(topRestMap.values())
      .map((r) => ({
        restaurantId: r.restaurantId,
        name: r.name,
        menuItemCount: r.menuItemIds.size,
      }))
      .sort((a, b) => b.menuItemCount - a.menuItemCount)
      .slice(0, 5)

    return NextResponse.json({
      menuItemsUsingYourIngredients: menuItemsUsingCount,
      restaurantsUsingYourIngredients: restaurantsCount,
      topIngredientsByRecipeUsage: topIngredients,
      stockRequestTrend: monthBuckets,
      topRestaurants,
    })
  } catch (error) {
    console.error('Supplier analytics GET:', error)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}
