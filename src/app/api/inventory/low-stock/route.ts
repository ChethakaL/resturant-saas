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

    const items = await prisma.ingredient.findMany({
      where: {
        restaurantId: session.user.restaurantId,
      },
      orderBy: {
        stockQuantity: 'asc',
      },
    })

    const lowStock = items.filter((item) => item.stockQuantity <= item.minStockLevel)

    return NextResponse.json(lowStock)
  } catch (error: any) {
    console.error('Error fetching low stock items:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch low stock items' },
      { status: 500 }
    )
  }
}
