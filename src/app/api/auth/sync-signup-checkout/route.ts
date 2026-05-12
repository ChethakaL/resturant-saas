import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import {
  getStripeCouponIdsFromSubscription,
  recordPromoRedemptionForRestaurant,
} from '@/lib/promo-redemptions'

export const dynamic = 'force-dynamic'

function getId(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const checkoutSessionId =
      typeof body?.checkoutSessionId === 'string' ? body.checkoutSessionId.trim() : ''

    if (!checkoutSessionId.startsWith('cs_')) {
      return NextResponse.json({ error: 'Missing checkout session id' }, { status: 400 })
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['subscription'],
    })

    if (checkoutSession.mode !== 'subscription' || checkoutSession.status !== 'complete') {
      return NextResponse.json({ ok: false, reason: 'checkout_not_complete' }, { status: 200 })
    }

    const restaurantId =
      typeof checkoutSession.metadata?.restaurantId === 'string'
        ? checkoutSession.metadata.restaurantId
        : null
    const subscriptionId = getId(checkoutSession.subscription)
    const customerId = getId(checkoutSession.customer)

    if (!restaurantId || !subscriptionId || !customerId) {
      return NextResponse.json({ ok: false, reason: 'missing_checkout_links' }, { status: 200 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, stripeCustomerId: true },
    })
    if (!restaurant) {
      return NextResponse.json({ ok: false, reason: 'restaurant_not_found' }, { status: 200 })
    }
    if (restaurant.stripeCustomerId && restaurant.stripeCustomerId !== customerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const subscription =
      checkoutSession.subscription && typeof checkoutSession.subscription === 'object'
        ? checkoutSession.subscription
        : await stripe.subscriptions.retrieve(subscriptionId)

    const firstItem = subscription.items.data[0]
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionPriceId: firstItem?.price?.id ?? null,
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null,
      },
    })

    await recordPromoRedemptionForRestaurant({
      restaurantId: restaurant.id,
      promotionCode:
        typeof checkoutSession.metadata?.promotionCode === 'string'
          ? checkoutSession.metadata.promotionCode
          : null,
      stripeCouponIds: getStripeCouponIdsFromSubscription(subscription),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[signup checkout sync] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync checkout' },
      { status: 500 }
    )
  }
}
