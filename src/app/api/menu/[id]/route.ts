import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { buildTranslationSeed } from '@/lib/menu-translation-seed'
import { buildSourceFingerprint } from '@/lib/menu-translations'
import { normalizeTranslationInputs } from '@/lib/menu-translation-input'
import { generateMenuDescription } from '@/lib/menu-description-ai'

function normalizeMenuIngredients(ingredients: any[] = []) {
  const mergedByIngredient = new Map<string, any>()

  for (const raw of ingredients) {
    const ingredientId = raw?.ingredientId
    const quantity = Number(raw?.quantity)
    if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0) continue

    const existing = mergedByIngredient.get(ingredientId)
    if (!existing) {
      mergedByIngredient.set(ingredientId, {
        ...raw,
        ingredientId,
        quantity,
        pieceCount:
          raw?.pieceCount == null || raw?.pieceCount === ''
            ? null
            : Number(raw.pieceCount),
      })
      continue
    }

    // DB allows one row per (menuItemId, ingredientId), so duplicate entries must be merged.
    existing.quantity += quantity
    if (raw?.pieceCount != null && raw?.pieceCount !== '') {
      const nextPieceCount = Number(raw.pieceCount)
      if (Number.isFinite(nextPieceCount)) {
        existing.pieceCount = (existing.pieceCount ?? 0) + nextPieceCount
      }
    }
    if (!existing.unit && raw?.unit) existing.unit = raw.unit
    if (!existing.supplierProductId && raw?.supplierProductId) {
      existing.supplierProductId = raw.supplierProductId
    }
    if (existing.unitCostCached == null && raw?.unitCostCached != null) {
      existing.unitCostCached = raw.unitCostCached
    }
    if (!existing.currency && raw?.currency) existing.currency = raw.currency
    if (!existing.lastPricedAt && raw?.lastPricedAt) {
      existing.lastPricedAt = raw.lastPricedAt
    }
  }

  return Array.from(mergedByIngredient.values())
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Verify menu item belongs to restaurant
    const existing = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      include: { category: { select: { name: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    // Generate description once when saving with no description and item has none (max 18 words)
    const hasDescriptionInPayload = data.description !== undefined
    const payloadDescription = hasDescriptionInPayload ? String(data.description ?? '').trim() : null
    if (hasDescriptionInPayload && !payloadDescription && !(existing.description && existing.description.trim())) {
      const [categoryName, restaurant] = await Promise.all([
        existing.category?.name ?? (data.categoryId ? (await prisma.category.findUnique({ where: { id: data.categoryId }, select: { name: true } }))?.name : null) ?? null,
        prisma.restaurant.findUnique({
          where: { id: session.user.restaurantId! },
          select: { settings: true },
        }),
      ])
      const settings = (restaurant?.settings as Record<string, unknown>) || {}
      const theme = (settings.theme as Record<string, unknown>) || {}
      const descriptionTone = typeof theme.descriptionTone === 'string' ? theme.descriptionTone : null
      const generated = await generateMenuDescription({
        itemName: data.name ?? existing.name,
        categoryName,
        tags: data.tags ?? existing.tags ?? null,
        price: data.price ?? existing.price ?? null,
        descriptionTone,
      })
      if (generated) data.description = generated
    }

    const validIngredients = normalizeMenuIngredients(data.ingredients)
    const hasRecipe = validIngredients.length > 0

    // Check if ALL ingredients have costs (not just some)
    // Fetch actual ingredient costs from database
    let hasCosting = false
    if (hasRecipe) {
      const ingredientIds = Array.from(
        new Set(validIngredients.map((ing: any) => ing.ingredientId))
      )
      const ingredients = await prisma.ingredient.findMany({
        where: { id: { in: ingredientIds } },
        select: { id: true, costPerUnit: true }
      })

      // All ingredients must have costPerUnit > 0
      hasCosting = ingredients.length === validIngredients.length &&
        ingredients.every(ing => ing.costPerUnit > 0)
    }

    const costingStatus = hasRecipe && hasCosting ? 'COMPLETE' : 'INCOMPLETE'

    // Update menu item and ingredients in a transaction
    const menuItem = await prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.update({
        where: { id: params.id },
        data: {
          name: data.name,
          description: data.description,
          price: data.price,
          imageUrl: data.imageUrl,
          available: data.available,
          ...(data.status && { status: data.status }),
          costingStatus,
          category: { connect: { id: data.categoryId } },
          calories: data.calories,
          protein: data.protein,
          carbs: data.carbs,
          tags: data.tags || [],
          prepTime: data.prepTime || null,
          cookTime: data.cookTime || null,
          recipeSteps: data.recipeSteps || [],
          recipeTips: data.recipeTips || [],
        },
      })

      await tx.menuItemIngredient.deleteMany({
        where: { menuItemId: params.id },
      })

      if (validIngredients.length > 0) {
        await tx.menuItemIngredient.createMany({
          data: validIngredients.map((ing: any) => ({
            menuItemId: item.id,
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
            pieceCount: ing.pieceCount || null,
            unit: ing.unit || null,
            supplierProductId: ing.supplierProductId || null,
            unitCostCached: ing.unitCostCached ?? null,
            currency: ing.currency || null,
            lastPricedAt: ing.lastPricedAt ? new Date(ing.lastPricedAt) : null,
          })),
        })
      }

      // Delete existing add-on associations
      await tx.menuItemAddOn.deleteMany({
        where: { menuItemId: params.id },
      })

      // Create new add-on associations
      if (data.addOnIds && data.addOnIds.length > 0) {
        await tx.menuItemAddOn.createMany({
          data: data.addOnIds.map((addOnId: string) => ({
            menuItemId: item.id,
            addOnId,
          })),
        })
      }

      const sanitizedTranslations = normalizeTranslationInputs(data.translations)
      if (sanitizedTranslations.length > 0) {
        const category = await tx.category.findUnique({
          where: { id: data.categoryId },
        })

        const translationSeed = buildTranslationSeed({
          name: data.name,
          description: data.description ?? '',
          categoryName: category?.name,
          price: data.price,
          calories: data.calories,
          protein: data.protein,
          carbs: data.carbs,
        })

        if (translationSeed) {
          const sourceHash = buildSourceFingerprint(translationSeed.payload)
          const sourceUpdatedAt = new Date()

          await Promise.all(
            sanitizedTranslations.map((translation) =>
              tx.menuItemTranslation.upsert({
                where: {
                  menuItemId_language: {
                    menuItemId: item.id,
                    language: translation.language,
                  },
                },
                update: {
                  translatedName:
                    translation.name || translationSeed.payload.name,
                  translatedDescription:
                    translation.description ||
                    translationSeed.payload.description,
                  aiDescription: translation.aiDescription,
                  protein: translation.protein,
                  carbs: translation.carbs,
                  sourceHash,
                  sourceUpdatedAt,
                },
                create: {
                  menuItemId: item.id,
                  language: translation.language,
                  translatedName: translation.name,
                  translatedDescription: translation.description,
                  aiDescription: translation.aiDescription,
                  protein: translation.protein,
                  carbs: translation.carbs,
                  sourceHash,
                  sourceUpdatedAt,
                },
              })
            )
          )
        }
      }

      return item
    })

    // Revalidate the public menu page so changes appear immediately
    revalidatePath('/')

    return NextResponse.json(menuItem)
  } catch (error) {
    console.error('Error updating menu item:', error)
    return NextResponse.json(
      { error: 'Failed to update menu item' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify menu item belongs to restaurant
    const existing = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    await prisma.menuItem.delete({
      where: { id: params.id },
    })

    // Revalidate the public menu page so deleted items disappear immediately
    revalidatePath('/')

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting menu item:', error)

    if (error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Cannot delete this item because it is referenced by other records (e.g., sales or meal prep). Please try again or archive it.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to delete menu item' },
      { status: 500 }
    )
  }
}
