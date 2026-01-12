import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const resolvedParams = params instanceof Promise ? await params : params
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Verify ingredient belongs to restaurant
    const ingredient = await prisma.ingredient.findFirst({
      where: {
        id: resolvedParams.id,
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
    const result = await prisma.$transaction(async (tx) => {
      // Update ingredient stock
      const updatedIngredient = await tx.ingredient.update({
        where: { id: resolvedParams.id },
        data: {
          stockQuantity: newStock,
        },
      })

      // Create stock adjustment record
      await tx.stockAdjustment.create({
        data: {
          ingredientId: resolvedParams.id,
          quantityChange: data.quantityChange,
          reason: data.reason,
          notes: data.notes,
        },
      })

      // If this is a usage (negative quantity change) and reason indicates "used", create COGS expense
      if (data.quantityChange < 0 && (data.reason?.toLowerCase().includes('used') || data.reason?.toLowerCase().includes('usage'))) {
        const quantityUsed = Math.abs(data.quantityChange)
        const cost = quantityUsed * ingredient.costPerUnit

        // Create expense transaction for COGS
        await tx.expenseTransaction.create({
          data: {
            name: `COGS: ${ingredient.name} (Manual Adjustment)`,
            category: 'INVENTORY_PURCHASE', // Using this category for COGS tracking
            amount: cost,
            date: new Date(),
            notes: `Manual stock adjustment: ${quantityUsed} ${ingredient.unit} used. ${data.notes || ''}`,
            restaurantId: session.user.restaurantId,
          },
        })
      }

      return updatedIngredient
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error adjusting stock:', error)
    return NextResponse.json(
      { error: 'Failed to adjust stock' },
      { status: 500 }
    )
  }
}
