import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { sendRestaurantOrderWhatsApp } from '@/lib/whatsapp-orders'
import { buildRestaurantOrderWhatsAppNumber } from '@/lib/restaurant-whatsapp'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get('restaurantId') || undefined
    const tableNumber = searchParams.get('tableNumber') || searchParams.get('table') || undefined

    if (!restaurantId || !tableNumber) {
      return NextResponse.json({ error: 'Restaurant and table are required' }, { status: 400 })
    }

    const table = await prisma.table.findUnique({
      where: { restaurantId_number: { restaurantId, number: tableNumber } },
      select: { id: true, number: true },
    })

    if (!table) {
      return NextResponse.json({ order: null })
    }

    const orders = await prisma.sale.findMany({
      where: {
        restaurantId,
        tableId: table.id,
        status: { in: ['PENDING', 'PREPARING', 'READY'] },
      },
      include: {
        items: {
          include: {
            menuItem: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (orders.length === 0) {
      return NextResponse.json({ order: null })
    }

    return NextResponse.json({
      order: {
        orderNumber: orders.map((order) => order.orderNumber).join(', '),
        tableNumber: table.number,
        total: orders.reduce((sum, order) => sum + order.total, 0),
        lines: orders.flatMap((order) =>
          order.items.map((item) => ({
            id: item.id,
            name: item.menuItem.name,
            quantity: item.quantity,
            total: item.price * item.quantity,
          }))
        ),
      },
    })
  } catch (error: any) {
    console.error('Error fetching public table order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch table order' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    const customerId =
      session?.user?.type === 'customer' && session?.user?.id
        ? (session.user.id as string)
        : null

    const data = await request.json()
    const restaurantId = data.restaurantId as string | undefined
    const items = data.items as { menuItemId: string; quantity: number }[]
    const tableIdFromClient = data.tableId as string | undefined
    const tableNumber = data.tableNumber != null ? String(data.tableNumber) : undefined

    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not specified' }, { status: 400 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, phone: true, settings: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    let tableId: string | null = null
    let resolvedTableNumber: string | null = null
    if (tableIdFromClient) {
      const table = await prisma.table.findFirst({
        where: { id: tableIdFromClient, restaurantId },
      })
      if (table) {
        tableId = table.id
        resolvedTableNumber = table.number
      }
    } else if (tableNumber) {
      const table = await prisma.table.findUnique({
        where: { restaurantId_number: { restaurantId, number: tableNumber } },
      })
      if (table) {
        tableId = table.id
        resolvedTableNumber = table.number
      }
    }

    const menuItemsData = await prisma.menuItem.findMany({
      where: {
        id: { in: items.map((item) => item.menuItemId) },
        restaurantId,
        available: true,
      },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    })

    let total = 0
    const saleItems: any[] = []

    for (const orderItem of items) {
      const menuItem = menuItemsData.find((m) => m.id === orderItem.menuItemId)
      if (!menuItem) {
        throw new Error(`Menu item not found: ${orderItem.menuItemId}`)
      }

      const cost = menuItem.ingredients.reduce(
        (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
        0
      )

      total += menuItem.price * orderItem.quantity

      saleItems.push({
        menuItemId: menuItem.id,
        quantity: orderItem.quantity,
        price: menuItem.price,
        cost,
      })
    }

    const orderCount = await prisma.sale.count({
      where: { restaurantId },
    })
    const orderNumber = `ORD-${(orderCount + 1).toString().padStart(5, '0')}`

    if (tableId) {
      await prisma.table.update({
        where: { id: tableId },
        data: { status: 'OCCUPIED' },
      })
    }

    const sale = await prisma.sale.create({
      data: {
        orderNumber,
        total,
        paymentMethod: 'CASH',
        status: 'PENDING',
        customerName: data.customerName || (session?.user?.name as string) || 'Guest',
        notes: data.notes || 'Customer self-order',
        restaurantId,
        customerId,
        tableId,
        items: {
          createMany: {
            data: saleItems,
          },
        },
      },
    })

    try {
      console.log('[whatsapp-orders] sending through whatsapp')
      const whatsappResult = await sendRestaurantOrderWhatsApp({
        restaurantName: restaurant.name,
        restaurantPhone: buildRestaurantOrderWhatsAppNumber(restaurant.settings, restaurant.phone),
        orderNumber: sale.orderNumber,
        tableNumber: resolvedTableNumber,
        customerName: data.customerName || (session?.user?.name as string) || 'Guest',
        total,
        items: saleItems.map((item) => {
          const menuItem = menuItemsData.find((m) => m.id === item.menuItemId)
          return {
            name: menuItem?.name || 'Menu item',
            quantity: item.quantity,
            price: item.price,
          }
        }),
      })
      
      if (whatsappResult.sent) {
        console.log('[whatsapp-orders] sent successfully')
      } else if (whatsappResult.skipped) {
        console.log('[whatsapp-orders] skipped sending whatsapp (missing Twilio config or destination)')
      }
    } catch (error: any) {
      console.log('[whatsapp-orders] reason why it didnt get sent:', error?.message || error)
      console.error('[whatsapp-orders] Failed to send public order notification:', error)
    }

    return NextResponse.json({ id: sale.id, orderNumber: sale.orderNumber })
  } catch (error: any) {
    console.error('Error creating public order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create order' },
      { status: 500 }
    )
  }
}
