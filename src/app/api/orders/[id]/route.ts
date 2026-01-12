import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const order = await prisma.sale.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
      include: {
        items: {
          include: {
            menuItem: {
              include: {
                category: true,
              },
            },
          },
        },
        table: true,
        waiter: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Error fetching order:', error)
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Verify order belongs to restaurant
    const existing = await prisma.sale.findFirst({
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

    if (!existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const order = await prisma.$transaction(async (tx) => {
      // If changing to PREPARING, deduct inventory
      if (data.status === 'PREPARING' && existing.status === 'PENDING') {
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

        // Check stock availability
        for (const [ingredientId, usage] of Array.from(ingredientUsage.entries())) {
          const ingredient = await tx.ingredient.findUnique({
            where: { id: ingredientId },
          })

          if (!ingredient) {
            throw new Error(`Ingredient not found`)
          }

          if (ingredient.stockQuantity < usage) {
            throw new Error(
              `Insufficient stock for ${ingredient.name}. Need ${usage.toFixed(2)} ${ingredient.unit}, have ${ingredient.stockQuantity.toFixed(2)} ${ingredient.unit}`
            )
          }
        }

        // Deduct inventory
        for (const [ingredientId, usage] of Array.from(ingredientUsage.entries())) {
          await tx.ingredient.update({
            where: { id: ingredientId },
            data: { stockQuantity: { decrement: usage } },
          })

          await tx.stockAdjustment.create({
            data: {
              ingredientId,
              quantityChange: -usage,
              reason: 'sale_deduction',
              notes: `Order ${existing.orderNumber}`,
            },
          })
        }
      }

      return tx.sale.update({
        where: { id: params.id },
        data: {
          status: data.status,
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

    return NextResponse.json(order)
  } catch (error: any) {
    console.error('Error updating order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update order' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const order = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: {
          id: params.id,
          restaurantId: session.user.restaurantId,
        },
        include: {
          items: {
            include: {
              menuItem: {
                include: {
                  ingredients: true,
                },
              },
            },
          },
        },
      })

      if (!sale) {
        return null
      }

      if (sale.status === 'CANCELLED') {
        throw new Error('Order already cancelled')
      }

      const ingredientUsage = new Map<string, number>()

      sale.items.forEach((item) => {
        item.menuItem.ingredients.forEach((ing) => {
          const currentUsage = ingredientUsage.get(ing.ingredientId) || 0
          ingredientUsage.set(
            ing.ingredientId,
            currentUsage + ing.quantity * item.quantity
          )
        })
      })

      for (const [ingredientId, usage] of Array.from(ingredientUsage.entries())) {
        await tx.ingredient.update({
          where: { id: ingredientId },
          data: {
            stockQuantity: {
              increment: usage,
            },
          },
        })

        await tx.stockAdjustment.create({
          data: {
            ingredientId,
            quantityChange: usage,
            reason: 'order_cancel',
            notes: `Order ${sale.orderNumber} cancelled`,
          },
        })
      }

      return tx.sale.update({
        where: { id: sale.id },
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
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json(order)
  } catch (error: any) {
    console.error('Error cancelling order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cancel order' },
      { status: 500 }
    )
  }
}
