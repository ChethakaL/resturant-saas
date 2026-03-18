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
      const sentVariantIds = data.variants
        .filter((v: any) => v.id != null && v.id !== '')
        .map((v: any) => Number(v.id))
        .filter((id) => Number.isFinite(id))

      if (sentVariantIds.length > 0) {
        await prisma.ingredientVariant.deleteMany({
          where: {
            ingredientId: resolvedParams.id,
            id: { notIn: sentVariantIds },
          },
        })
      } else {
        await prisma.ingredientVariant.deleteMany({
          where: { ingredientId: resolvedParams.id },
        })
      }

      for (const v of data.variants) {
        const variantId = v.id != null && v.id !== '' ? Number(v.id) : null
        if (Number.isFinite(variantId)) {
          const existingVariant = await prisma.ingredientVariant.findFirst({
            where: { id: variantId as number, ingredientId: resolvedParams.id },
          })
          if (existingVariant) {
            await prisma.ingredientVariant.update({
              where: { id: variantId as number },
              data: {
                brand: (v.brand ?? '').trim(),
                supplier: (v.supplier ?? '').trim() || null,
                purchaseFormat: (v.purchaseFormat ?? '').trim() || null,
                packageQuantity: v.packageQuantity != null && v.packageQuantity !== '' ? Number(v.packageQuantity) : null,
                packageUnit: v.packageUnit ?? 'g',
                bulkPrice: v.bulkPrice != null && v.bulkPrice !== '' ? Number(v.bulkPrice) : null,
                costPerUnit: Number(v.costPerUnit) || 0,
              },
            })
          }
        } else {
          await prisma.ingredientVariant.create({
            data: {
              brand: (v.brand ?? '').trim(),
              supplier: (v.supplier ?? '').trim() || null,
              purchaseFormat: (v.purchaseFormat ?? '').trim() || null,
              packageQuantity: v.packageQuantity != null && v.packageQuantity !== '' ? Number(v.packageQuantity) : null,
              packageUnit: v.packageUnit ?? 'g',
              bulkPrice: v.bulkPrice != null && v.bulkPrice !== '' ? Number(v.bulkPrice) : null,
              costPerUnit: Number(v.costPerUnit) || 0,
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
  } catch (error: unknown) {
    const err = error as Error & { code?: string }
    console.error('Error updating ingredient:', err)
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      {
        error: 'Failed to update ingredient',
        ...(isDev && { detail: err?.message ?? 'Unknown error' }),
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
