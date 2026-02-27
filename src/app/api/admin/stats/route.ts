import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.type !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [restaurantCount, restaurants, menuEventCount, userCount] = await Promise.all([
      prisma.restaurant.count(),
      prisma.restaurant.findMany({
        select: {
          subscriptionStatus: true,
          createdAt: true,
        },
      }),
      prisma.menuEvent.count(),
      prisma.user.count(),
    ])

    const bySubscription = restaurants.reduce(
      (acc, r) => {
        const s = r.subscriptionStatus || 'none'
        acc[s] = (acc[s] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    const thisMonth = new Date()
    thisMonth.setDate(1)
    thisMonth.setHours(0, 0, 0, 0)
    const newThisMonth = restaurants.filter((r) => new Date(r.createdAt) >= thisMonth).length

    return NextResponse.json({
      restaurantCount,
      userCount,
      menuEventCount,
      bySubscription,
      newRestaurantsThisMonth: newThisMonth,
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json(
      { error: 'Failed to load stats' },
      { status: 500 }
    )
  }
}
