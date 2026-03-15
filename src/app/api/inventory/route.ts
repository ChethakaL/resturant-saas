import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { canonicalise, isAllowedUnit, computeConversion } from '@/lib/unit-converter'

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
        unit: resolvedUnit,
        stockQuantity: 999999,
        costPerUnit: resolvedCostPerUnit,
        minStockLevel: 0,
        notes: data.notes,
        restaurantId: session.user.restaurantId,
      },
    })

    if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
      await prisma.ingredientVariant.createMany({
        data: data.variants.map((v: any) => ({
          brand: v.brand.trim(),
          supplier: v.supplier?.trim() || null,
          purchaseFormat: v.purchaseFormat?.trim() || null,
          packageQuantity: v.packageQuantity || null,
          packageUnit: v.packageUnit,
          bulkPrice: v.bulkPrice || null,
          costPerUnit: v.costPerUnit,
          ingredientId: ingredient.id,
        })),
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

    const ingredients = await prisma.ingredient.findMany({
      where: { restaurantId: session.user.restaurantId },
      include: {
        variants: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(ingredients)
  } catch (error) {
    console.error('Error fetching ingredients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ingredients' },
      { status: 500 }
    )
  }
}
