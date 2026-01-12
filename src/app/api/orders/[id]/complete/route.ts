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

    const order = await prisma.$transaction(async (tx) => {
      // Get the order
      const existing = await tx.sale.findFirst({
        where: {
          id: params.id,
          restaurantId: session.user.restaurantId,
        },
      })

      if (!existing) {
        throw new Error('Order not found')
      }

      if (existing.status === 'COMPLETED') {
        throw new Error('Order already completed')
      }

      if (existing.status === 'CANCELLED') {
        throw new Error('Cannot complete cancelled order')
      }

      // Get order items with menu items
      const orderItems = await tx.saleItem.findMany({
        where: { saleId: params.id },
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
      })

      // Process each order item: check prepped stock first, then raw ingredients
      for (const orderItem of orderItems) {
        const quantityNeeded = orderItem.quantity

        // Check prepped stock first
        const preppedStock = await tx.preppedDishStock.findUnique({
          where: { menuItemId: orderItem.menuItemId },
        })

        let remainingQuantity = quantityNeeded
        let usedFromPrepped = 0

        if (preppedStock && preppedStock.availableQuantity > 0) {
          usedFromPrepped = Math.min(
            preppedStock.availableQuantity,
            quantityNeeded
          )
          remainingQuantity = quantityNeeded - usedFromPrepped

          // Deduct from prepped stock
          await tx.preppedDishStock.update({
            where: { menuItemId: orderItem.menuItemId },
            data: {
              availableQuantity: {
                decrement: usedFromPrepped,
              },
            },
          })
        }

        // If we still need more, use raw ingredients
        if (remainingQuantity > 0) {
          // Calculate ingredient usage for remaining quantity
          const ingredientUsage = new Map<string, number>()

          for (const recipeIng of orderItem.menuItem.ingredients) {
            const totalNeeded = recipeIng.quantity * remainingQuantity
            const current = ingredientUsage.get(recipeIng.ingredientId) || 0
            ingredientUsage.set(recipeIng.ingredientId, current + totalNeeded)
          }

          // Validate and deduct raw ingredients
          for (const [ingredientId, needed] of ingredientUsage.entries()) {
            const ingredient = await tx.ingredient.findUnique({
              where: { id: ingredientId },
            })

            if (!ingredient) {
              throw new Error(`Ingredient not found: ${ingredientId}`)
            }

            if (ingredient.stockQuantity < needed) {
              throw new Error(
                `Insufficient stock for ${ingredient.name}. Need ${needed} ${ingredient.unit}, have ${ingredient.stockQuantity} ${ingredient.unit}`
              )
            }

            // Deduct from inventory
            await tx.ingredient.update({
              where: { id: ingredientId },
              data: {
                stockQuantity: {
                  decrement: needed,
                },
              },
            })

            // Create stock adjustment
            await tx.stockAdjustment.create({
              data: {
                ingredientId,
                quantityChange: -needed,
                reason: 'sale_deduction',
                notes: `Order ${existing.orderNumber}: ${remainingQuantity}x ${orderItem.menuItem.name} (raw ingredients)`,
              },
            })
          }
        }
      }

      // Update order to completed and set payment info
      const updatedSale = await tx.sale.update({
        where: { id: params.id },
        data: {
          status: 'COMPLETED',
          paidAt: new Date(),
          paymentMethod: data.paymentMethod || existing.paymentMethod,
          paymentProvider: data.paymentProvider || existing.paymentProvider,
          stripePaymentIntentId: data.stripePaymentIntentId || existing.stripePaymentIntentId,
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

      // Update table status to AVAILABLE if order has a table
      if (existing.tableId) {
        // Check if there are other active orders for this table
        const otherActiveOrders = await tx.sale.count({
          where: {
            tableId: existing.tableId,
            status: {
              in: ['PENDING', 'PREPARING', 'READY'],
            },
            id: {
              not: params.id,
            },
          },
        })

        // Only set to AVAILABLE if no other active orders
        if (otherActiveOrders === 0) {
          await tx.table.update({
            where: { id: existing.tableId },
            data: { status: 'AVAILABLE' },
          })
        }
      }

      return updatedSale
    })

    return NextResponse.json(order)
  } catch (error: any) {
    console.error('Error completing order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to complete order' },
      { status: 500 }
    )
  }
}
