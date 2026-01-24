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
        table: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Order not found or not pending' }, { status: 404 })
    }

    const order = await prisma.$transaction(async (tx) => {
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
