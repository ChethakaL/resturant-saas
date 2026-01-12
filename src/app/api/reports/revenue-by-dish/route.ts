import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {
      sale: {
        restaurantId: session.user.restaurantId,
        status: 'COMPLETED',
      },
    }

    if (startDate && endDate) {
      where.sale.timestamp = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const items = await prisma.saleItem.groupBy({
      by: ['menuItemId'],
      where,
      _sum: {
        quantity: true,
        price: true,
      },
      _count: true,
    })

    const results = await Promise.all(
      items.map(async (item) => {
        const menuItem = await prisma.menuItem.findUnique({
          where: { id: item.menuItemId },
        })
        return {
          menuItemId: item.menuItemId,
          name: menuItem?.name || 'Unknown',
          quantity: item._sum.quantity || 0,
          revenue: item._sum.price || 0,
          orders: item._count,
        }
      })
    )

    return NextResponse.json(results)
  } catch (error: any) {
    console.error('Error fetching revenue by dish:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch revenue by dish' },
      { status: 500 }
    )
  }
}
