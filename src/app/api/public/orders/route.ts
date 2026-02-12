import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
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

    let tableId: string | null = null
    if (tableIdFromClient) {
      const table = await prisma.table.findFirst({
        where: { id: tableIdFromClient, restaurantId },
      })
      if (table) tableId = table.id
    } else if (tableNumber) {
      const table = await prisma.table.findUnique({
        where: { restaurantId_number: { restaurantId, number: tableNumber } },
      })
      if (table) tableId = table.id
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
        customerName: data.customerName || 'Guest',
        notes: data.notes || 'Customer self-order',
        restaurantId,
        tableId,
        items: {
          createMany: {
            data: saleItems,
          },
        },
      },
    })

    return NextResponse.json({ id: sale.id, orderNumber: sale.orderNumber })
  } catch (error: any) {
    console.error('Error creating public order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create order' },
      { status: 500 }
    )
  }
}
