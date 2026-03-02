import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

export const dynamic = 'force-dynamic'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        subscriptionStatus: true,
        subscriptionPriceId: true,
        currentPeriodEnd: true,
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    const isActive =
      restaurant.subscriptionStatus === 'active' || restaurant.subscriptionStatus === 'trialing'
    const currentPeriodEnd = restaurant.currentPeriodEnd?.toISOString() ?? null

    return NextResponse.json({
      status: restaurant.subscriptionStatus ?? null,
      isActive,
      currentPeriodEnd,
      priceId: restaurant.subscriptionPriceId ?? null,
    })
  } catch (error) {
    console.error('Billing status error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 }
    )
  }
}
