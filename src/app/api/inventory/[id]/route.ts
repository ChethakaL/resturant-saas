import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { canonicalise, isAllowedUnit, computeConversion } from '@/lib/unit-converter'
import { DEFAULT_INVENTORY_CATEGORY, isInventoryCategory } from '@/lib/inventory-categories'

const getPrimaryVariantCost = (variants: any[] | undefined, fallback: unknown) => {
  if (Array.isArray(variants) && variants.length > 0) {
    const firstVariantCost = Number(variants[0]?.costPerUnit)
    if (Number.isFinite(firstVariantCost)) {
      return firstVariantCost
    }
  }

  const fallbackCost = Number(fallback)
  return Number.isFinite(fallbackCost) ? fallbackCost : undefined
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = params instanceof Promise ? await params : params
    const data = await request.json()

    // Verify ingredient belongs to restaurant
    const existing = await prisma.ingredient.findFirst({
      where: {
        id: resolvedParams.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
    }

    let resolvedUnit: string = canonicalise(data.unit ?? '')
    if (!isAllowedUnit(resolvedUnit)) {
      const conversion = computeConversion(data.unit ?? '', data.name ?? '')
      if (conversion) {
        resolvedUnit = conversion.targetUnit
      } else {
        resolvedUnit = 'g'
      }
    }

    const updateData: {
      name?: string
      category?: string
      unit?: string
      costPerUnit?: number
      minStockLevel?: number
      notes?: string | null
      preferredSupplierId?: string | null
    } = {
      name: data.name,
      category:
        data.category === undefined
          ? undefined
          : isInventoryCategory(data.category)
            ? data.category
            : DEFAULT_INVENTORY_CATEGORY,
      unit: resolvedUnit,
      minStockLevel: data.minStockLevel,
      notes: data.notes,
    }
    if (data.preferredSupplierId !== undefined) {
      updateData.preferredSupplierId = data.preferredSupplierId === '' || data.preferredSupplierId == null ? null : data.preferredSupplierId
    }

    if (data.variants && Array.isArray(data.variants)) {
      updateData.costPerUnit = getPrimaryVariantCost(data.variants, data.costPerUnit)
    } else if (data.costPerUnit !== undefined) {
      const directCost = Number(data.costPerUnit)
      if (Number.isFinite(directCost)) {
        updateData.costPerUnit = directCost
      }
    }

    const ingredient = await prisma.ingredient.update({
      where: { id: resolvedParams.id },
      data: updateData,
    })

    if (data.variants && Array.isArray(data.variants)) {
      const sentVariantIds = data.variants.filter((v: any) => v.id).map((v: any) => v.id)

      await prisma.ingredientVariant.deleteMany({
        where: {
          ingredientId: resolvedParams.id,
          id: { notIn: sentVariantIds },
        },
      })

      for (const v of data.variants) {
        if (v.id) {
          await prisma.ingredientVariant.update({
            where: { id: v.id },
            data: {
              brand: v.brand?.trim(),
              supplier: v.supplier?.trim() || null,
              purchaseFormat: v.purchaseFormat?.trim() || null,
              packageQuantity: v.packageQuantity || null,
              packageUnit: v.packageUnit,
              bulkPrice: v.bulkPrice || null,
              costPerUnit: v.costPerUnit,
            },
          })
        } else {
          await prisma.ingredientVariant.create({
            data: {
              brand: v.brand?.trim(),
              supplier: v.supplier?.trim() || null,
              purchaseFormat: v.purchaseFormat?.trim() || null,
              packageQuantity: v.packageQuantity || null,
              packageUnit: v.packageUnit,
              bulkPrice: v.bulkPrice || null,
              costPerUnit: v.costPerUnit,
              ingredientId: resolvedParams.id,
            },
          })
        }
      }
    }

    const fullIngredient = await prisma.ingredient.findUnique({
      where: { id: resolvedParams.id },
      include: { variants: true },
    })

    return NextResponse.json(fullIngredient)
  } catch (error) {
    console.error('Error updating ingredient:', error)
    return NextResponse.json(
      { error: 'Failed to update ingredient' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = params instanceof Promise ? await params : params

    // Verify ingredient belongs to restaurant
    const existing = await prisma.ingredient.findFirst({
      where: {
        id: resolvedParams.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
    }

    await prisma.ingredient.delete({
      where: { id: resolvedParams.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting ingredient:', error)
    return NextResponse.json(
      { error: 'Failed to delete ingredient' },
      { status: 500 }
    )
  }
}
