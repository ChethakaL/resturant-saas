import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isZeroCostAllowed } from '@/lib/costing'

const BATCH_SIZE = 50

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function duplicateImportKey(item: { name?: unknown; price?: unknown }) {
  const price = Number(item.price)
  return `${normalizeText(item.name)}|${Number.isFinite(price) ? price.toFixed(2) : '0.00'}`
}

function normalizeMenuIngredients(ingredients: any[] = []) {
  const mergedByNameOrId = new Map<string, any>()
  for (const raw of ingredients) {
    const name = String(raw?.name ?? '').trim()
    const ingredientId = typeof raw?.ingredientId === 'string' ? raw.ingredientId : null
    const quantity = Number(raw?.quantity)
    if (!name && !ingredientId) continue
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    const key = ingredientId ? `id:${ingredientId}` : `name:${normalizeText(name)}`
    const existing = mergedByNameOrId.get(key)
    if (!existing) {
      mergedByNameOrId.set(key, {
        ...raw,
        ingredientId,
        name,
        quantity,
        unit: raw?.unit || 'g',
        pieceCount: raw?.pieceCount == null || raw?.pieceCount === '' ? null : Number(raw.pieceCount),
      })
      continue
    }

    existing.quantity += quantity
    if (raw?.pieceCount != null && raw?.pieceCount !== '') {
      const nextPieceCount = Number(raw.pieceCount)
      if (Number.isFinite(nextPieceCount)) existing.pieceCount = (existing.pieceCount ?? 0) + nextPieceCount
    }
  }
  return Array.from(mergedByNameOrId.values())
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const items = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) {
      return NextResponse.json({ error: 'No menu items provided' }, { status: 400 })
    }

    const restaurantId = session.user.restaurantId
    const existingItems = await prisma.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, price: true },
    })
    const existingItemKeys = new Set(existingItems.map(duplicateImportKey))
    const seenRequestKeys = new Set<string>()
    const uniqueItems: any[] = []
    let skippedDuplicates = 0

    for (const item of items) {
      const key = duplicateImportKey(item)
      if (!normalizeText(item.name) || existingItemKeys.has(key) || seenRequestKeys.has(key)) {
        skippedDuplicates += 1
        continue
      }
      seenRequestKeys.add(key)
      uniqueItems.push(item)
    }

    const existingIngredients = await prisma.ingredient.findMany({
      where: { restaurantId },
      select: { id: true, name: true, unit: true, costPerUnit: true },
    })
    const ingredientMap = new Map(existingIngredients.map((ingredient) => [normalizeText(ingredient.name), ingredient]))
    const missingIngredientNames = new Map<string, { name: string; unit: string }>()

    for (const item of uniqueItems) {
      for (const ingredient of normalizeMenuIngredients(item.ingredients || [])) {
        if (ingredient.ingredientId) continue
        const key = normalizeText(ingredient.name)
        if (!key || ingredientMap.has(key)) continue
        missingIngredientNames.set(key, { name: ingredient.name, unit: ingredient.unit || 'g' })
      }
    }

    if (missingIngredientNames.size > 0) {
      await prisma.ingredient.createMany({
        data: Array.from(missingIngredientNames.values()).map((ingredient) => ({
          name: ingredient.name,
          unit: ingredient.unit,
          costPerUnit: 0,
          stockQuantity: 0,
          minStockLevel: 0,
          restaurantId,
        })),
      })

      const refreshedIngredients = await prisma.ingredient.findMany({
        where: { restaurantId },
        select: { id: true, name: true, unit: true, costPerUnit: true },
      })
      ingredientMap.clear()
      for (const ingredient of refreshedIngredients) {
        if (!ingredientMap.has(normalizeText(ingredient.name))) {
          ingredientMap.set(normalizeText(ingredient.name), ingredient)
        }
      }
    }

    const errors: string[] = []
    let createdCount = 0

    for (let start = 0; start < uniqueItems.length; start += BATCH_SIZE) {
      const batch = uniqueItems.slice(start, start + BATCH_SIZE)
      await prisma.$transaction(async (tx) => {
        for (const item of batch) {
          if (!item.categoryId) {
            errors.push(`${item.name}: Missing category`)
            continue
          }

          const normalizedIngredients = normalizeMenuIngredients(item.ingredients || [])
          const ingredientRows = normalizedIngredients
            .map((ingredient) => {
              const existing = ingredient.ingredientId
                ? null
                : ingredientMap.get(normalizeText(ingredient.name))
              const ingredientId = ingredient.ingredientId || existing?.id
              if (!ingredientId) return null
              return {
                ingredientId,
                quantity: Number(ingredient.quantity) || 0,
                pieceCount: ingredient.pieceCount ?? null,
                unit: existing?.unit || ingredient.unit || null,
              }
            })
            .filter((ingredient): ingredient is { ingredientId: string; quantity: number; pieceCount: number | null; unit: string | null } => Boolean(ingredient))

          const ingredientCosts = ingredientRows.length > 0
            ? await tx.ingredient.findMany({
                where: { id: { in: ingredientRows.map((ingredient) => ingredient.ingredientId) } },
                select: { id: true, name: true, costPerUnit: true },
              })
            : []
          const hasRecipe = ingredientRows.length > 0
          const hasCosting =
            hasRecipe &&
            ingredientCosts.length === ingredientRows.length &&
            ingredientCosts.every((ingredient) => ingredient.costPerUnit > 0 || isZeroCostAllowed(ingredient.name))

          try {
            const created = await tx.menuItem.create({
              data: {
                name: item.name,
                description: item.description || '',
                price: Number(item.price) || 0,
                categoryId: item.categoryId,
                imageUrl: item.imageUrl || '',
                mediaAssetId: item.mediaAssetId || null,
                calories: item.calories ? Number(item.calories) : null,
                protein: item.protein ? Number(item.protein) : null,
                carbs: item.carbs ? Number(item.carbs) : null,
                tags: Array.isArray(item.tags) ? item.tags : [],
                available: item.available ?? true,
                status: item.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
                costingStatus: hasRecipe && hasCosting ? 'COMPLETE' : 'INCOMPLETE',
                restaurantId,
                prepTime: item.prepTime || null,
                cookTime: item.cookTime || null,
                recipeSteps: Array.isArray(item.recipeSteps) ? item.recipeSteps : [],
                recipeTips: Array.isArray(item.recipeTips) ? item.recipeTips : [],
              },
            })

            if (ingredientRows.length > 0) {
              await tx.menuItemIngredient.createMany({
                data: ingredientRows.map((ingredient) => ({
                  menuItemId: created.id,
                  ingredientId: ingredient.ingredientId,
                  quantity: ingredient.quantity,
                  pieceCount: ingredient.pieceCount,
                  unit: ingredient.unit,
                })),
              })
            }

            if (Array.isArray(item.addOnIds) && item.addOnIds.length > 0) {
              await tx.menuItemAddOn.createMany({
                data: item.addOnIds.map((addOnId: string) => ({
                  menuItemId: created.id,
                  addOnId,
                })),
                skipDuplicates: true,
              })
            }

            createdCount += 1
          } catch (error) {
            errors.push(`${item.name}: ${error instanceof Error ? error.message : 'Failed to create'}`)
          }
        }
      })
    }

    revalidatePath('/')

    return NextResponse.json({
      success: true,
      createdCount,
      skippedDuplicates,
      failedCount: errors.length,
      errors: errors.slice(0, 20),
      ingredientsCreated: missingIngredientNames.size,
    })
  } catch (error) {
    console.error('Bulk menu create error:', error)
    return NextResponse.json({ error: 'Failed to create menu items' }, { status: 500 })
  }
}
