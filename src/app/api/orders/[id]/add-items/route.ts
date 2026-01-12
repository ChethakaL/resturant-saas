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
      // Verify order exists and is not completed
      const existing = await tx.sale.findFirst({
        where: {
          id: params.id,
          restaurantId: session.user.restaurantId,
        },
      })

      if (!existing) {
        throw new Error('Order not found')
      }

      if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
        throw new Error('Cannot add items to completed or cancelled order')
      }

      // Fetch menu items with ingredients
      const menuItemsData = await tx.menuItem.findMany({
        where: {
          id: { in: data.items.map((item: any) => item.menuItemId) },
          restaurantId: session.user.restaurantId,
        },
        include: {
          ingredients: {
            include: {
              ingredient: true,
            },
          },
        },
      })

      let additionalTotal = 0
      const saleItems: any[] = []

      for (const orderItem of data.items) {
        const menuItem = menuItemsData.find((m) => m.id === orderItem.menuItemId)
        if (!menuItem) {
          throw new Error(`Menu item not found: ${orderItem.menuItemId}`)
        }

        const cost = menuItem.ingredients.reduce(
          (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
          0
        )

        additionalTotal += menuItem.price * orderItem.quantity

        saleItems.push({
          saleId: params.id,
          menuItemId: menuItem.id,
          quantity: orderItem.quantity,
          price: menuItem.price,
          cost: cost,
        })
      }

      // Add new items
      await tx.saleItem.createMany({
        data: saleItems,
      })

      // Update total
      const updatedSale = await tx.sale.update({
        where: { id: params.id },
        data: {
          total: {
            increment: additionalTotal,
          },
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

      return updatedSale
    })

    return NextResponse.json(order)
  } catch (error: any) {
    console.error('Error adding items to order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add items to order' },
      { status: 500 }
    )
  }
}
