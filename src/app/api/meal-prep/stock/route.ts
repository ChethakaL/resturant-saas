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

    const stock = await prisma.preppedDishStock.findMany({
      where: {
        restaurantId: session.user.restaurantId,
      },
      include: {
        menuItem: true,
      },
      orderBy: {
        lastUpdated: 'desc',
      },
    })

    return NextResponse.json(stock)
  } catch (error: any) {
    console.error('Error fetching prepped stock:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch prepped stock' },
      { status: 500 }
    )
  }
}
