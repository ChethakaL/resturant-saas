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

    // Cancel order and restore inventory in a transaction
    const order = await prisma.$transaction(async (tx) => {
      // Verify order belongs to restaurant
      const existingOrder = await tx.sale.findFirst({
        where: {
          id: params.id,
          restaurantId: session.user.restaurantId,
        },
        include: {
          items: {
            include: {
              menuItem: {
                include: {
                  ingredients: {
                    include: {
                      ingredient: true,
                    },
                  },
                },
              },
            },
          },
        },
      })

      if (!existingOrder) {
        throw new Error('Order not found')
      }

      if (existingOrder.status === 'CANCELLED') {
        throw new Error('Order is already cancelled')
      }

      // Calculate ingredients to restore
      const ingredientRestoration = new Map<string, number>()

      existingOrder.items.forEach((saleItem) => {
        saleItem.menuItem.ingredients.forEach((ing) => {
          const currentRestoration = ingredientRestoration.get(ing.ingredientId) || 0
          ingredientRestoration.set(
            ing.ingredientId,
            currentRestoration + ing.quantity * saleItem.quantity
          )
        })
      })

      // Restore inventory and create stock adjustment records
      for (const [ingredientId, quantity] of Array.from(ingredientRestoration.entries())) {
        // Update stock quantity
        await tx.ingredient.update({
          where: { id: ingredientId },
          data: {
            stockQuantity: {
              increment: quantity,
            },
          },
        })

        // Create stock adjustment record
        await tx.stockAdjustment.create({
          data: {
            ingredientId,
            quantityChange: quantity,
            reason: 'adjustment',
            notes: `Order ${existingOrder.orderNumber} cancelled - stock restored`,
          },
        })
      }

      // Update order status
      const cancelledOrder = await tx.sale.update({
        where: { id: params.id },
        data: {
          status: 'CANCELLED',
        },
        include: {
          items: {
            include: {
              menuItem: true,
            },
          },
        },
      })

      return cancelledOrder
    })

    return NextResponse.json(order)
  } catch (error: any) {
    console.error('Error cancelling order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cancel order' },
      { status: 500 }
    )
  }
}
