import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    const ingredient = await prisma.ingredient.create({
      data: {
        name: data.name,
        unit: data.unit,
        stockQuantity: 999999, // Default high value - stock tracking disabled
        costPerUnit: data.costPerUnit,
        minStockLevel: 0, // Default value - stock tracking disabled
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
