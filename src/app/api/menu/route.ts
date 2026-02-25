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

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Generate description once when missing (max 18 words; sensory, texture, heat, origin, scarcity; tone from DNA)
    if (data.name && !(data.description && String(data.description).trim())) {
      const [category, restaurant] = await Promise.all([
        data.categoryId
          ? prisma.category.findUnique({ where: { id: data.categoryId }, select: { name: true } })
          : null,
        prisma.restaurant.findUnique({
          where: { id: session.user.restaurantId! },
          select: { settings: true },
        }),
      ])
      const settings = (restaurant?.settings as Record<string, unknown>) || {}
      const theme = (settings.theme as Record<string, unknown>) || {}
      const descriptionTone = typeof theme.descriptionTone === 'string' ? theme.descriptionTone : null
      const generated = await generateMenuDescription({
        itemName: data.name,
        categoryName: category?.name ?? null,
        tags: data.tags ?? null,
        price: data.price ?? null,
        descriptionTone,
      })
      if (generated) data.description = generated
    }

    // Create menu item with ingredients in a transaction
    const menuItem = await prisma.$transaction(async (tx) => {
      // Create the menu item
      const validIngredients = normalizeMenuIngredients(data.ingredients)
      const hasRecipe = validIngredients.length > 0

      // Check if ALL ingredients have costs (not just some)
      // Fetch actual ingredient costs from database
      let hasCosting = false
      if (hasRecipe) {
        const ingredientIds = Array.from(
          new Set(validIngredients.map((ing: any) => ing.ingredientId))
        )
        const ingredients = await tx.ingredient.findMany({
          where: { id: { in: ingredientIds } },
          select: { id: true, costPerUnit: true }
        })

        // All ingredients must have costPerUnit > 0
        hasCosting = ingredients.length === validIngredients.length &&
          ingredients.every(ing => ing.costPerUnit > 0)
      }

      const status = data.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT'
      const costingStatus = hasRecipe && hasCosting ? 'COMPLETE' : 'INCOMPLETE'

      const item = await tx.menuItem.create({
        data: {
          name: data.name,
          description: data.description,
          price: data.price,
          imageUrl: data.imageUrl,
          available: data.available,
          status,
          costingStatus,
          categoryId: data.categoryId,
          restaurantId: session.user.restaurantId,
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

      // Create add-on associations
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

    // Revalidate the public menu page so new items appear immediately
    revalidatePath('/')

    return NextResponse.json(menuItem)
  } catch (error) {
    console.error('Error creating menu item:', error)
    return NextResponse.json(
      { error: 'Failed to create menu item' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId: session.user.restaurantId },
      include: {
        category: true,
        ingredients: {
          include: {
            ingredient: true,
          },
        },
        addOns: {
          include: {
            addOn: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(menuItems)
  } catch (error) {
    console.error('Error fetching menu items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menu items' },
      { status: 500 }
    )
  }
}
