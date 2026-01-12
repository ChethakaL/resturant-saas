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

    // Generate order number
    const orderCount = await prisma.sale.count({
      where: { restaurantId: session.user.restaurantId },
    })
    const orderNumber = `ORD-${(orderCount + 1).toString().padStart(5, '0')}`

    // Create order (inventory deduction happens when status changes to PREPARING)
    const order = await prisma.$transaction(async (tx) => {
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

      // Calculate totals
      let total = 0
      const saleItems: any[] = []

      for (const orderItem of data.items) {
        const menuItem = menuItemsData.find((m) => m.id === orderItem.menuItemId)
        if (!menuItem) {
          throw new Error(`Menu item not found: ${orderItem.menuItemId}`)
        }

        // Calculate cost for this item
        const cost = menuItem.ingredients.reduce(
          (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
          0
        )

        total += menuItem.price * orderItem.quantity

        saleItems.push({
          menuItemId: menuItem.id,
          quantity: orderItem.quantity,
          price: menuItem.price,
          cost: cost,
        })
      }

      // Update table status if table is assigned
      if (data.tableId) {
        await tx.table.update({
          where: { id: data.tableId },
          data: { status: 'OCCUPIED' },
        })
      }

      // Create the sale
      const sale = await tx.sale.create({
        data: {
          orderNumber,
          total,
          paymentMethod: data.paymentMethod || 'CASH',
          paymentProvider: data.paymentProvider || null,
          stripePaymentIntentId: data.stripePaymentIntentId || null,
          status: data.status || 'PENDING',
          paidAt: data.paidAt ? new Date(data.paidAt) : undefined,
          customerName: data.customerName,
          tableId: data.tableId,
          waiterId: data.waiterId,
          notes: data.notes,
          restaurantId: session.user.restaurantId,
          items: {
            create: saleItems,
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

      return sale
    })

    return NextResponse.json(order)
  } catch (error: any) {
    console.error('Error creating order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create order' },
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

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {
      restaurantId: session.user.restaurantId,
    }

    if (status && status !== 'all') {
      where.status = status
    }

    if (startDate && endDate) {
      where.timestamp = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const orders = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
        table: true,
        waiter: true,
      },
      orderBy: { timestamp: 'desc' },
    })

    return NextResponse.json(orders)
  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}
