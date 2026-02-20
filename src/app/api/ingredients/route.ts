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

    // Validate required fields
    if (!data.name || !data.unit) {
      return NextResponse.json(
        { error: 'Name and unit are required' },
        { status: 400 }
      )
    }

    // Normalise unit to g/kg/ml/L — auto-convert non-standard units
    let resolvedUnit: string = canonicalise(data.unit)
    let resolvedCostPerUnit: number = data.costPerUnit || 0
    if (!isAllowedUnit(resolvedUnit)) {
      const conversion = computeConversion(data.unit, data.name)
      if (conversion) {
        resolvedUnit = conversion.targetUnit
        resolvedCostPerUnit = resolvedCostPerUnit * conversion.costFactor
      } else {
        // Cannot auto-convert: default to 'g' for dry, 'ml' for liquid rather than storing a bad unit
        resolvedUnit = 'g'
      }
    }

    // Check if ingredient already exists
    const existing = await prisma.ingredient.findFirst({
      where: {
        restaurantId: session.user.restaurantId,
        name: {
          equals: data.name,
          mode: 'insensitive',
        },
      },
    })

    if (existing) {
      return NextResponse.json(existing)
    }

    // Create the ingredient
    const ingredient = await prisma.ingredient.create({
      data: {
        name: data.name,
        unit: resolvedUnit,
        costPerUnit: resolvedCostPerUnit,
        stockQuantity: data.stockQuantity || 0,
        minStockLevel: data.minStockLevel || 0,
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
