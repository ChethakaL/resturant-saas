import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { publicMenuDataCacheTag } from '@/lib/public-menu-cache-tags'
import { buildTranslationSeed } from '@/lib/menu-translation-seed'
import { buildSourceFingerprint } from '@/lib/menu-translations'
import { normalizeTranslationInputs } from '@/lib/menu-translation-input'
import { generateMenuDescription } from '@/lib/menu-description-ai'
import { isZeroCostAllowed } from '@/lib/costing'
import { inferMenuTags } from '@/lib/menu-tags-ai'

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
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params

    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data?.categoryId) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }

    // Verify category exists and belongs to restaurant
    const category = await prisma.category.findFirst({
      where: {
        id: data.categoryId,
        restaurantId: session.user.restaurantId,
      },
    })
    if (!category) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    // Verify menu item belongs to restaurant
    const existing = await prisma.menuItem.findFirst({
      where: {
        id: resolvedParams.id,
        restaurantId: session.user.restaurantId,
      },
      include: {
        category: { select: { name: true } },
        ingredients: { include: { ingredient: { select: { name: true } } } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    const categoryName =
      category?.name ??
      existing.category?.name ??
      null
    data.tags = await inferMenuTags({
      itemName: typeof data.name === 'string' ? data.name : existing.name,
      description:
        typeof data.description === 'string'
          ? data.description
          : existing.description,
      categoryName,
      ingredientNames: Array.isArray(data.ingredients)
        ? data.ingredients
            .map((ingredient: any) => (typeof ingredient?.name === 'string' ? ingredient.name : null))
            .filter((name: string | null): name is string => Boolean(name))
        : existing.ingredients.map((ingredient) => ingredient.ingredient.name),
      existingTags: Array.isArray(data.tags) ? data.tags : existing.tags,
      protein:
        typeof data.protein === 'number'
          ? data.protein
          : existing.protein,
      carbs:
        typeof data.carbs === 'number'
          ? data.carbs
          : existing.carbs,
    })

    // Generate description once when saving with no description and item has none (max 18 words)
    const hasDescriptionInPayload = data.description !== undefined
    const payloadDescription = hasDescriptionInPayload ? String(data.description ?? '').trim() : null
    if (hasDescriptionInPayload && !payloadDescription && !(existing.description && existing.description.trim())) {
      const [categoryName, restaurant] = await Promise.all([
        Promise.resolve(category?.name ?? existing.category?.name ?? null),
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
        select: { id: true, name: true, costPerUnit: true }
      })

      // All ingredients must have costPerUnit > 0, except water and similar (allowed at 0)
      hasCosting =
        ingredients.length === validIngredients.length &&
        ingredients.every((ing) => ing.costPerUnit > 0 || isZeroCostAllowed(ing.name))
    }

    const costingStatus = hasRecipe && hasCosting ? 'COMPLETE' : 'INCOMPLETE'

    // Update menu item and ingredients in a transaction
    const menuItem = await prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.update({
        where: { id: resolvedParams.id },
        data: {
          name: data.name,
          description: data.description,
          price: data.price,
          imageUrl: data.imageUrl,
          ...(data.mediaAssetId
            ? { mediaAsset: { connect: { id: data.mediaAssetId } } }
            : { mediaAsset: { disconnect: true } }),
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
          recipeSteps: Array.isArray(data.recipeSteps) ? data.recipeSteps : [],
          recipeTips: Array.isArray(data.recipeTips) ? data.recipeTips : [],
        },
      })

      await tx.menuItemIngredient.deleteMany({
        where: { menuItemId: resolvedParams.id },
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
        where: { menuItemId: resolvedParams.id },
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
                  aiDescription: translation.aiDescription ?? '',
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
                  aiDescription: translation.aiDescription ?? '',
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
    try {
      revalidatePath('/')
      const rest = await prisma.restaurant.findUnique({
        where: { id: session.user.restaurantId },
        select: { slug: true },
      })
      if (rest?.slug) {
        revalidatePath(`/${rest.slug}`)
        revalidateTag(publicMenuDataCacheTag(rest.slug))
      }
    } catch (revalidateErr) {
      console.warn('revalidatePath failed:', revalidateErr)
    }

    return NextResponse.json(menuItem)
  } catch (error: unknown) {
    const err = error as Error & { code?: string }
    console.error('Error updating menu item:', err)
    const message = err?.message ?? 'Unknown error'
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      {
        error: 'Failed to update menu item',
        ...(isDev && { detail: message, code: err?.code }),
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params

    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify menu item belongs to restaurant
    const existing = await prisma.menuItem.findFirst({
      where: {
        id: resolvedParams.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    await prisma.menuItem.delete({
      where: { id: resolvedParams.id },
    })

    // Revalidate the public menu page so deleted items disappear immediately
    revalidatePath('/')
    const rest = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { slug: true },
    })
    if (rest?.slug) {
      revalidatePath(`/${rest.slug}`)
      revalidateTag(publicMenuDataCacheTag(rest.slug))
    }

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
