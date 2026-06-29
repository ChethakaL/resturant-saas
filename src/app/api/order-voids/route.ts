import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can review order voids' }, { status: 403 })
    }

    const voids = await prisma.orderVoid.findMany({
      where: {
        restaurantId: session.user.restaurantId,
      },
      orderBy: {
        voidedAt: 'desc',
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            total: true,
            timestamp: true,
            paidAt: true,
          },
        },
        performedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ voids })
  } catch (error: any) {
    console.error('Error fetching order voids:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch order voids' },
      { status: 500 }
    )
  }
}
