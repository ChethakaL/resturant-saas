import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import {
  DEFAULT_CATEGORY_NAMES,
  suggestCategoryAssignments,
  type ItemForSuggest,
} from '@/lib/category-suggest'

export const dynamic = 'force-dynamic'

export async function POST() {
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
        where: { restaurantId },
        include: {
          category: true,
          ingredients: { include: { ingredient: true } },
        },
      }),
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

    const itemsForSuggest: ItemForSuggest[] = menuItems.map((item) => {
      const ingredientTotal = item.ingredients.reduce(
        (sum, ing) => sum + ing.quantity * (ing.ingredient?.costPerUnit ?? 0),
        0
      )
      const marginPercent =
        item.price > 0 ? ((item.price - ingredientTotal) / item.price) * 100 : 0
      const agg = salesByItem.get(item.id)
      return {
        id: item.id,
        name: item.name,
        categoryName: item.category?.name ?? null,
        marginPercent,
        unitsSold: agg?.quantity ?? 0,
      }
    })

    const existingNames = new Set(categories.map((c) => c.name))
    let displayOrder = categories.length
    const nameToId: Record<string, string> = {}
    for (const c of categories) {
      nameToId[c.name] = c.id
    }

    for (const name of DEFAULT_CATEGORY_NAMES) {
      if (existingNames.has(name)) continue
      const created = await prisma.category.create({
        data: {
          name,
          displayOrder,
          showOnMenu: true,
          restaurantId,
        },
      })
      nameToId[name] = created.id
      displayOrder++
      categories.push(created)
    }

    const assignments = suggestCategoryAssignments(itemsForSuggest, nameToId)
    for (const [menuItemId, categoryId] of assignments) {
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: { categoryId },
      })
    }

    revalidatePath('/categories')
    revalidatePath('/menu')
    revalidatePath('/')
    revalidatePath('/dashboard/categories')

    return NextResponse.json({
      updated: assignments.size,
      categories: categories.length,
    })
  } catch (error) {
    console.error('AI suggest categories failed:', error)
    return NextResponse.json(
      { error: 'Failed to run AI categorization' },
      { status: 500 }
    )
  }
}
