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
    })

    if (!existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Cannot modify completed or cancelled order' },
        { status: 400 }
      )
    }

    const order = await prisma.sale.update({
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

    const sale = await prisma.sale.findFirst({
      where: {
        id: params.id,
        restaurantId: session.user.restaurantId,
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (sale.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Cannot cancel a paid order' }, { status: 400 })
    }

    if (sale.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Order already cancelled' }, { status: 400 })
    }

    const order = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.sale.update({
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

      if (sale.tableId) {
        const remainingActiveOrders = await tx.sale.count({
          where: {
            tableId: sale.tableId,
            restaurantId: session.user.restaurantId,
            status: { in: ['PENDING', 'PREPARING', 'READY'] },
          },
        })

        if (remainingActiveOrders === 0) {
          await tx.table.update({
            where: { id: sale.tableId },
            data: { status: 'AVAILABLE' },
          })
        }
      }

      return cancelled
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
