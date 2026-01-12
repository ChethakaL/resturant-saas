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

      // Update order to completed and set payment info
      const updatedSale = await tx.sale.update({
        where: { id: params.id },
        data: {
          status: 'COMPLETED',
          paidAt: new Date(),
          paymentMethod: data.paymentMethod || existing.paymentMethod,
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
