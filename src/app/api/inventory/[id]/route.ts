import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { canonicalise, isAllowedUnit, computeConversion } from '@/lib/unit-converter'

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
      unit?: string
      minStockLevel?: number
      notes?: string | null
      preferredSupplierId?: string | null
    } = {
      name: data.name,
      unit: resolvedUnit,
      minStockLevel: data.minStockLevel,
      notes: data.notes,
    }
    if (data.preferredSupplierId !== undefined) {
      updateData.preferredSupplierId = data.preferredSupplierId === '' || data.preferredSupplierId == null ? null : data.preferredSupplierId
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
