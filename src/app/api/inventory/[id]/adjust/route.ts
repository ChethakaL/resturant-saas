import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Verify ingredient belongs to restaurant
    const ingredient = await prisma.ingredient.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!ingredient) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
    }

    // Calculate new stock quantity
    const newStock = ingredient.stockQuantity + data.quantityChange

    if (newStock < 0) {
      return NextResponse.json(
        { error: 'Insufficient stock for this adjustment' },
        { status: 400 }
      )
    }

    // Update stock and create adjustment record in a transaction
    const result = await prisma.$transaction([
      prisma.ingredient.update({
        where: { id: params.id },
        data: {
          stockQuantity: newStock,
        },
      }),
      prisma.stockAdjustment.create({
        data: {
          ingredientId: params.id,
          quantityChange: data.quantityChange,
          reason: data.reason,
          notes: data.notes,
        },
      }),
    ])

    return NextResponse.json(result[0])
  } catch (error) {
    console.error('Error adjusting stock:', error)
    return NextResponse.json(
      { error: 'Failed to adjust stock' },
      { status: 500 }
    )
  }
}
