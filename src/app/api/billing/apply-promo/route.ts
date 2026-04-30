import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Applies a promo code and activates subscription for the period (1 year or 1 month). No Stripe checkout. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const code = typeof body.promotionCode === 'string' ? body.promotionCode.trim().toUpperCase() : null

    if (!code || code.length < 2) {
      return NextResponse.json({ error: 'Enter a promo code' }, { status: 400 })
    }

    const promo = await prisma.promoCode.findUnique({ where: { code } })
    if (!promo) {
      return NextResponse.json({ error: 'Invalid promo code' }, { status: 400 })
    }
    if (!promo.stripeCouponId) {
      return NextResponse.json({ error: 'This promo code is not properly configured.' }, { status: 400 })
    }
    if (promo.maxRedemptions != null && promo.timesRedeemed >= promo.maxRedemptions) {
      return NextResponse.json({ error: 'This promo code has reached its usage limit.' }, { status: 400 })
    }

    const existingRedemption = await prisma.promoRedemption.findUnique({
      where: {
        promoCodeId_restaurantId: { promoCodeId: promo.id, restaurantId: session.user.restaurantId },
      },
    })
    if (existingRedemption) {
      return NextResponse.json({ error: 'You have already used this promo code.' }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { id: true, subscriptionStatus: true },
    })
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }
    if (restaurant.subscriptionStatus === 'active' || restaurant.subscriptionStatus === 'trialing') {
      return NextResponse.json({ error: 'You already have an active subscription.' }, { status: 400 })
    }

    const now = new Date()
    const monthsToAdd = promo.type === 'ONE_YEAR_FREE' ? 12 : 1
    const currentPeriodEnd = new Date(now)
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + monthsToAdd)

    const priceMonthly = process.env.STRIPE_PRICE_MONTHLY
    const priceAnnual = process.env.STRIPE_PRICE_ANNUAL
    const subscriptionPriceId = promo.type === 'ONE_YEAR_FREE' ? priceAnnual ?? null : priceMonthly ?? null

    await prisma.$transaction([
      prisma.restaurant.update({
        where: { id: restaurant.id },
        data: {
          subscriptionStatus: 'active',
          currentPeriodEnd,
          subscriptionPriceId,
        },
      }),
      prisma.promoCode.update({
        where: { id: promo.id },
        data: { timesRedeemed: { increment: 1 } },
      }),
      prisma.promoRedemption.create({
        data: { promoCodeId: promo.id, restaurantId: restaurant.id },
      }),
    ])

    return NextResponse.json({
      success: true,
      type: promo.type,
      message: promo.type === 'ONE_YEAR_FREE' ? '1 year free activated!' : '1 month free activated!',
      currentPeriodEnd: currentPeriodEnd.toISOString(),
    })
  } catch (error) {
    console.error('Apply promo error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply promo' },
      { status: 500 }
    )
  }
}
