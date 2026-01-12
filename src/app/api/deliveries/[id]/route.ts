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

    const delivery = await prisma.delivery.findUnique({
      where: { id: params.id },
      include: {
        ingredient: true,
        expenseTransaction: true,
      },
    })

    if (!delivery || delivery.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    return NextResponse.json(delivery)
  } catch (error: any) {
    console.error('Error fetching delivery:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch delivery' },
      { status: 500 }
    )
  }
}
