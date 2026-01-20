import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = typeof params === 'object' && 'then' in params 
      ? await params 
      : params
    const orderId = resolvedParams.id

    // Verify order belongs to restaurant and is pending
    const existing = await prisma.sale.findFirst({
      where: {
        id: orderId,
        restaurantId: session.user.restaurantId,
        status: 'PENDING',
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
        table: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Order not found or not pending' }, { status: 404 })
    }

    const order = await prisma.$transaction(async (tx) => {
      const ingredientUsage = new Map<string, number>()

      existing.items.forEach((item) => {
        item.menuItem.ingredients.forEach((ing) => {
          const currentUsage = ingredientUsage.get(ing.ingredientId) || 0
          ingredientUsage.set(
            ing.ingredientId,
            currentUsage + ing.quantity * item.quantity
          )
        })
      })

      for (const [ingredientId, usage] of ingredientUsage.entries()) {
        const ingredient = await tx.ingredient.findUnique({
          where: { id: ingredientId },
        })

        if (!ingredient) {
          throw new Error(`Ingredient not found: ${ingredientId}`)
        }

        if (ingredient.stockQuantity < usage) {
          throw new Error(
            `Insufficient stock for ${ingredient.name}. Need ${usage.toFixed(2)} ${ingredient.unit}, have ${ingredient.stockQuantity.toFixed(2)} ${ingredient.unit}`
          )
        }

        await tx.ingredient.update({
          where: { id: ingredientId },
          data: { stockQuantity: { decrement: usage } },
        })

        await tx.stockAdjustment.create({
          data: {
            ingredientId,
            quantityChange: -usage,
            reason: 'sale_deduction',
            notes: `Order ${existing.orderNumber} completed`,
          },
        })
      }

      // Update table status if assigned
      if (existing.tableId) {
        await tx.table.update({
          where: { id: existing.tableId },
          data: { status: 'AVAILABLE' },
        })
      }

      // Update order status to COMPLETED
      return tx.sale.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          paidAt: new Date(),
        },
        include: {
          items: {
            include: {
              menuItem: true,
            },
          },
          table: true,
          waiter: true,
        },
      })
    })

    return NextResponse.json({ success: true, order })
  } catch (error: any) {
    console.error('Error completing order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to complete order' },
      { status: 500 }
    )
  }
}
