import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { classifyQuadrant } from '@/lib/menu-engine'
import type { EngineMenuItem, EngineCategory } from '@/lib/menu-engine'

/** Admin-only: returns quadrant classification with CMS/PS (margin/sales) data. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurantId = session.user.restaurantId
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [menuItems, categories, salesLast30d] = await Promise.all([
      prisma.menuItem.findMany({
        where: { available: true, restaurantId },
        include: {
          category: true,
          ingredients: { include: { ingredient: true } },
        },
      }) as Promise<any[]>,
      prisma.category.findMany({
        where: { restaurantId },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.sale.findMany({
        where: { restaurantId, timestamp: { gte: thirtyDaysAgo } },
        include: { items: true },
      }),
    ])

    const salesByItem = new Map<string, { quantity: number; costSum: number }>()
    for (const sale of salesLast30d) {
      for (const si of sale.items) {
        const cur = salesByItem.get(si.menuItemId) ?? { quantity: 0, costSum: 0 }
        cur.quantity += si.quantity
        cur.costSum += (si.cost ?? 0) * si.quantity
        salesByItem.set(si.menuItemId, cur)
      }
    }

    const engineItems: EngineMenuItem[] = menuItems.map((item: any) => {
      const ingredientTotal = item.ingredients.reduce(
        (sum: number, ing: any) => sum + ing.quantity * ing.ingredient.costPerUnit,
        0
      )
      const marginPercent =
        item.price > 0 ? ((item.price - ingredientTotal) / item.price) * 100 : 0
      const agg = salesByItem.get(item.id)
      const unitsSold = agg?.quantity ?? 0
      return {
        id: item.id,
        name: item.name,
        price: item.price,
        categoryId: item.categoryId,
        categoryName: item.category?.name ?? undefined,
        _cost: ingredientTotal,
        _marginPercent: marginPercent,
        _unitsSold: unitsSold,
      }
    })

    const engineCategories: EngineCategory[] = categories.map((c: any) => {
      const catItems = engineItems.filter((e) => e.categoryId === c.id)
      const avgUnits =
        catItems.length > 0
          ? catItems.reduce((s, i) => s + i._unitsSold, 0) / catItems.length
          : 0
      const avgMargin =
        catItems.length > 0
          ? catItems.reduce((s, i) => s + i._marginPercent, 0) / catItems.length
          : 0
      return {
        id: c.id,
        name: c.name,
        displayOrder: c.displayOrder,
        itemIds: catItems.map((i) => i.id),
        _avgUnitsSold: avgUnits,
        _avgMargin: avgMargin,
      }
    })

    const categoryAvgById = new Map(engineCategories.map((c) => [c.id, c._avgUnitsSold || 1]))

    const items = engineItems.map((item) => {
      const avgSales = categoryAvgById.get(item.categoryId) ?? 1
      const quadrant = classifyQuadrant(item, avgSales)
      return {
        menuItemId: item.id,
        name: item.name,
        categoryName: item.categoryName,
        quadrant,
        marginPercent: Math.round(item._marginPercent * 10) / 10,
        unitsSold: item._unitsSold,
      }
    })

    const counts = { STAR: 0, WORKHORSE: 0, PUZZLE: 0, DOG: 0 }
    items.forEach((i) => { counts[i.quadrant as keyof typeof counts]++ })

    return NextResponse.json({
      counts,
      items,
    })
  } catch (error) {
    console.error('Error fetching quadrants:', error)
    return NextResponse.json(
      { error: 'Failed to fetch quadrant data' },
      { status: 500 }
    )
  }
}
