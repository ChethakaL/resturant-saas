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
        supplier: data.supplier,
        notes: data.notes,
        restaurantId: session.user.restaurantId,
      },
    })

    return NextResponse.json(ingredient)
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
