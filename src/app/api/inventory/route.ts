import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { canonicalise, isAllowedUnit, computeConversion } from '@/lib/unit-converter'
import { DEFAULT_INVENTORY_CATEGORY, isInventoryCategory } from '@/lib/inventory-categories'
import type { ManagementLocale } from '@/lib/i18n/translations'
import { translateInventoryApiIngredients } from '@/lib/i18n/inventory-display-translate'

const getPrimaryVariantCost = (variants: any[] | undefined, fallback: number) => {
  if (Array.isArray(variants) && variants.length > 0) {
    const firstVariantCost = Number(variants[0]?.costPerUnit)
    if (Number.isFinite(firstVariantCost)) {
      return firstVariantCost
    }
  }

  return fallback
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Normalise unit to g/kg/ml/L
    let resolvedUnit: string = canonicalise(data.unit ?? '')
    let resolvedCostPerUnit: number = data.costPerUnit ?? 0
    if (!isAllowedUnit(resolvedUnit)) {
      const conversion = computeConversion(data.unit ?? '', data.name ?? '')
      if (conversion) {
        resolvedUnit = conversion.targetUnit
        resolvedCostPerUnit = resolvedCostPerUnit * conversion.costFactor
      } else {
        resolvedUnit = 'g'
      }
    }

    const ingredient = await prisma.ingredient.create({
      data: {
        name: data.name,
        category: isInventoryCategory(data.category) ? data.category : DEFAULT_INVENTORY_CATEGORY,
        unit: resolvedUnit,
        stockQuantity: 999999,
        costPerUnit: getPrimaryVariantCost(data.variants, resolvedCostPerUnit),
        minStockLevel: 0,
        notes: data.notes,
        preferredSupplierId:
          data.preferredSupplierId === '' || data.preferredSupplierId == null
            ? null
            : data.preferredSupplierId,
        restaurantId: session.user.restaurantId,
      },
    })

    if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
      await prisma.ingredientVariant.createMany({
        data: data.variants.map((v: any) => ({
          brand: v.brand.trim(),
          supplier: v.supplier?.trim() || null,
          purchaseFormat: v.purchaseFormat?.trim() || null,
          purchaseDate: v.purchaseDate ? new Date(v.purchaseDate) : null,
          packageQuantity: v.packageQuantity || null,
          packageUnit: v.packageUnit,
          bulkPrice: v.bulkPrice || null,
          costPerUnit: v.costPerUnit,
          ingredientId: ingredient.id,
        })) as any,
      })
    }

    const fullIngredient = await prisma.ingredient.findUnique({
      where: { id: ingredient.id },
      include: { variants: true },
    })

    return NextResponse.json(fullIngredient)
  } catch (error) {
    console.error('Error creating ingredient:', error)
    return NextResponse.json(
      { error: 'Failed to create ingredient' },
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

    const [ingredients, restaurant] = await Promise.all([
      prisma.ingredient.findMany({
        where: { restaurantId: session.user.restaurantId },
        include: {
          variants: true,
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      prisma.restaurant.findUnique({
        where: { id: session.user.restaurantId },
        select: { settings: true },
      }),
    ])

    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    const lang = (settings.managementLanguage as string) || 'en'
    let managementLocale: ManagementLocale = 'en'
    if (lang === 'ku') managementLocale = 'ku'
    else if (lang === 'ar-fusha' || lang === 'ar_fusha') managementLocale = 'ar-fusha'

    const mapped = ingredients.map((ingredient) => ({
      ...ingredient,
      costPerUnit: getPrimaryVariantCost(ingredient.variants, ingredient.costPerUnit),
    }))

    const translated = await translateInventoryApiIngredients(mapped, managementLocale)

    return NextResponse.json(translated)
  } catch (error) {
    console.error('Error fetching ingredients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ingredients' },
      { status: 500 }
    )
  }
}
