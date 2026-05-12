import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import {
  getStripeCouponIdsFromSubscription,
  recordPromoRedemptionForRestaurant,
} from '@/lib/promo-redemptions'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.type !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [promoCoupons, restaurants] = await Promise.all([
      prisma.promoCode.findMany({
        where: { stripeCouponId: { not: null } },
        select: { stripeCouponId: true },
      }),
      prisma.restaurant.findMany({
        where: { stripeCustomerId: { not: null } },
        select: { id: true, stripeCustomerId: true },
      }),
    ])

    const knownCouponIds = new Set(
      promoCoupons
        .map((promo) => promo.stripeCouponId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )

    let checkedSubscriptions = 0
    let createdRedemptions = 0

    for (const restaurant of restaurants) {
      if (!restaurant.stripeCustomerId) continue

      const subscriptions = await stripe.subscriptions.list({
        customer: restaurant.stripeCustomerId,
        status: 'all',
        limit: 100,
      })

      for (const subscription of subscriptions.data) {
        checkedSubscriptions += 1
        const couponIds = getStripeCouponIdsFromSubscription(subscription).filter((id) =>
          knownCouponIds.has(id)
        )
        if (couponIds.length === 0) continue

        const result = await recordPromoRedemptionForRestaurant({
          restaurantId: restaurant.id,
          stripeCouponIds: couponIds,
        })
        if (result?.created) createdRedemptions += 1
      }
    }

    return NextResponse.json({
      success: true,
      checkedRestaurants: restaurants.length,
      checkedSubscriptions,
      createdRedemptions,
    })
  } catch (error) {
    console.error('Admin promo redemption sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync redemptions' },
      { status: 500 }
    )
  }
}
