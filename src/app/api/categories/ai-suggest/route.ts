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
import { classifyCategoriesWithAI } from '@/lib/category-suggest-ai'

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

    // Create any missing standard categories
    // But skip "Signature Dishes" if any signature category already exists
    const hasSignatureCategory = categories.some(cat =>
      cat.name.toLowerCase().includes('signature')
    )

    const createdCategories: string[] = []
    for (const name of DEFAULT_CATEGORY_NAMES) {
      if (existingNames.has(name)) continue

      // Skip creating "Signature Dishes" if we already have a signature category
      if (name === 'Signature Dishes' && hasSignatureCategory) {
        continue
      }

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
      createdCategories.push(name)
    }

    const hasAI = !!(process.env.GOOGLE_AI_KEY ?? process.env.OPENAI_API_KEY)
    let assignments: Map<string, string>

    if (hasAI) {
      try {
        const itemsForAI = menuItems.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description ?? undefined,
        }))
        const aiClassifications = await classifyCategoriesWithAI(itemsForAI)
        const score = (i: ItemForSuggest) => i.marginPercent * 1000 + Math.min(i.unitsSold, 1000)
        const mains = itemsForSuggest.filter((i) => aiClassifications.get(i.id) === 'Main Dishes')
        const shareables = itemsForSuggest.filter((i) => aiClassifications.get(i.id) === 'Shareables')
        mains.sort((a, b) => score(b) - score(a))
        shareables.sort((a, b) => score(b) - score(a))
        const signatureIds = new Set<string>()
        for (let i = 0; i < 4 && i < mains.length; i++) signatureIds.add(mains[i].id)
        for (let i = 0; i < 2 && i < shareables.length; i++) signatureIds.add(shareables[i].id)

        // Find existing signature category (prefer "Signature Sandwiches" over "Signature Dishes")
        const existingSignatureCategory = categories.find(cat =>
          cat.name.toLowerCase().includes('signature')
        )
        const signatureCatId = existingSignatureCategory?.id ?? nameToId['Signature Dishes']

        assignments = new Map<string, string>()
        for (const item of itemsForSuggest) {
          const key = aiClassifications.get(item.id) ?? 'Main Dishes'
          const catId = signatureIds.has(item.id) && signatureCatId
            ? signatureCatId
            : (nameToId[key] ?? nameToId['Main Dishes'])
          assignments.set(item.id, catId)
        }
      } catch (aiErr) {
        console.warn('AI categorization failed, falling back to rules:', aiErr)
        assignments = suggestCategoryAssignments(itemsForSuggest, nameToId)
      }
    } else {
      assignments = suggestCategoryAssignments(itemsForSuggest, nameToId)
    }

    // Track changes: item moves from old category to new category
    const changes: Array<{
      itemId: string
      itemName: string
      fromCategory: string | null
      toCategory: string
      reason: string
    }> = []

    const categoryIdToName = new Map<string, string>()
    for (const c of categories) {
      categoryIdToName.set(c.id, c.name)
    }

    for (const [menuItemId, newCategoryId] of Array.from(assignments.entries())) {
      const item = menuItems.find((i) => i.id === menuItemId)
      if (!item) continue

      const oldCategoryId = item.categoryId
      const newCategoryName = categoryIdToName.get(newCategoryId) ?? 'Unknown'

      // Only track if actually changing
      if (oldCategoryId !== newCategoryId) {
        const oldCategoryName = oldCategoryId ? categoryIdToName.get(oldCategoryId) ?? 'Uncategorized' : 'Uncategorized'

        // Determine reason
        let reason = 'Matched keywords'
        if (newCategoryName === 'Signature Dishes') {
          reason = 'High margin & popularity'
        }

        changes.push({
          itemId: menuItemId,
          itemName: item.name,
          fromCategory: oldCategoryName,
          toCategory: newCategoryName,
          reason,
        })

        await prisma.menuItem.update({
          where: { id: menuItemId },
          data: { categoryId: newCategoryId },
        })
      }
    }

    revalidatePath('/categories')
    revalidatePath('/menu')
    revalidatePath('/')
    revalidatePath('/dashboard/categories')

    return NextResponse.json({
      updated: changes.length,
      categories: categories.length,
      createdCategories,
      changes,
    })
  } catch (error) {
    console.error('AI suggest categories failed:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    })
    return NextResponse.json(
      {
        error: 'Failed to run AI categorization',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

