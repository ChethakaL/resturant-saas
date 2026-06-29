import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { reconcileRestaurantMainSubscriptions } from '@/lib/billing-subscription-sync'
import { isSubscriptionAccessActive } from '@/lib/subscription-status'
import {
  getStripeCouponIdsFromSubscription,
  recordPromoRedemptionForRestaurant,
} from '@/lib/promo-redemptions'
import { normalizeProductPlanTier } from '@/lib/plan-features'

export const dynamic = 'force-dynamic'

/**
 * Heals Postgres from Stripe when webhooks are missing (e.g. local dev without Stripe CLI).
 * Prefer passing `checkoutSessionId` from the success URL `{CHECKOUT_SESSION_ID}` placeholder.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let checkoutSessionId: string | undefined
    try {
      const body = await request.json()
      if (body && typeof body.checkoutSessionId === 'string' && body.checkoutSessionId.trim()) {
        checkoutSessionId = body.checkoutSessionId.trim()
      }
    } catch {
      /* empty body */
    }

    const restaurantId = session.user.restaurantId

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, stripeCustomerId: true, settings: true },
    })
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    let appliedFromCheckoutSession = false

    if (checkoutSessionId) {
      console.info('[billing] sync-from-stripe: retrieve checkout session', {
        restaurantId,
        checkoutSessionId,
      })

      const cs = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
        expand: ['subscription', 'line_items'],
      })

      if (cs.mode !== 'subscription') {
        console.warn('[billing] sync-from-stripe: session is not subscription mode', { checkoutSessionId })
        return NextResponse.json(
          { ok: false, isActive: false, reason: 'wrong_checkout_mode' },
          { status: 200 }
        )
      }

      if (cs.status !== 'complete') {
        console.warn('[billing] sync-from-stripe: checkout session not complete', {
          checkoutSessionId,
          checkoutSessionStatus: cs.status,
        })
        return NextResponse.json(
          {
            ok: false,
            isActive: false,
            reason: 'checkout_not_complete',
            checkoutSessionStatus: cs.status,
          },
          { status: 200 }
        )
      }

      if (
        cs.payment_status !== 'paid' &&
        cs.payment_status !== 'no_payment_required' &&
        cs.payment_status !== 'unpaid'
      ) {
        console.warn('[billing] sync-from-stripe: unexpected payment_status', {
          checkoutSessionId,
          payment_status: cs.payment_status,
        })
      }

      const metaRid = typeof cs.metadata?.restaurantId === 'string' ? cs.metadata.restaurantId : undefined
      const sessionCustomer = (() => {
        const c = cs.customer
        if (typeof c === 'string') return c
        if (c && typeof c === 'object' && 'deleted' in c && (c as { deleted?: boolean }).deleted) return null
        if (c && typeof c === 'object' && 'id' in c) return (c as { id: string }).id
        return null
      })()

      if (metaRid && metaRid !== restaurant.id) {
        console.error('[billing] sync-from-stripe: session metadata restaurant mismatch', {
          metaRid,
          expectedRestaurantId: restaurant.id,
        })
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      if (!metaRid && sessionCustomer && restaurant.stripeCustomerId && sessionCustomer !== restaurant.stripeCustomerId) {
        console.error('[billing] sync-from-stripe: customer mismatch and no session metadata', {
          sessionCustomer,
          restaurantCustomer: restaurant.stripeCustomerId,
        })
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const subRef = cs.subscription
      const subId = typeof subRef === 'string' ? subRef : subRef && 'id' in subRef ? subRef.id : null
      if (!subId) {
        console.warn('[billing] sync-from-stripe: no subscription on completed session', { checkoutSessionId })
        return NextResponse.json(
          { ok: false, isActive: false, reason: 'no_subscription_on_session' },
          { status: 200 }
        )
      }

      let subscription = await stripe.subscriptions.retrieve(subId)
      let spin = 0
      while (subscription.status === 'incomplete' && spin < 8) {
        await new Promise((r) => setTimeout(r, 500))
        subscription = await stripe.subscriptions.retrieve(subId)
        spin += 1
      }
      if (subscription.status === 'incomplete') {
        console.warn('[billing] sync-from-stripe: subscription still incomplete after wait', {
          subscriptionId: subId,
          payment_status: cs.payment_status,
        })
      }

      const ridForStripeMeta = metaRid || restaurant.id
      const checkoutPlanTier = normalizeProductPlanTier(cs.metadata?.productPlanTier)
      const checkoutBillingPeriod = cs.metadata?.plan === 'annual' || cs.metadata?.plan === 'monthly' ? cs.metadata.plan : null
      if (
        subscription.metadata?.restaurantId !== ridForStripeMeta ||
        (checkoutPlanTier && subscription.metadata?.productPlanTier !== checkoutPlanTier) ||
        (checkoutBillingPeriod && subscription.metadata?.plan !== checkoutBillingPeriod)
      ) {
        await stripe.subscriptions.update(subId, {
          metadata: {
            ...subscription.metadata,
            restaurantId: ridForStripeMeta,
            ...(checkoutPlanTier && { productPlanTier: checkoutPlanTier }),
            ...(checkoutBillingPeriod && { plan: checkoutBillingPeriod }),
          },
        })
        console.info('[billing] sync-from-stripe: patched subscription.metadata', {
          subscriptionId: subId,
          restaurantId: ridForStripeMeta,
        })
      }

      const customerToStore = sessionCustomer || restaurant.stripeCustomerId
      if (!customerToStore) {
        console.warn('[billing] sync-from-stripe: cannot resolve stripe customer id', { checkoutSessionId })
        return NextResponse.json({ ok: false, isActive: false, reason: 'no_customer' }, { status: 200 })
      }

      const firstItem = subscription.items.data[0]
      const cpe = subscription.current_period_end
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: {
          stripeCustomerId: customerToStore,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionPriceId: firstItem?.price?.id ?? null,
          currentPeriodEnd: cpe ? new Date(cpe * 1000) : null,
          ...(checkoutPlanTier && {
            settings: {
              ...((restaurant.settings as Record<string, unknown> | null) || {}),
              productPlanTier: checkoutPlanTier,
              ...(checkoutBillingPeriod && { subscriptionBillingPeriod: checkoutBillingPeriod }),
            },
          }),
        },
      })

      await recordPromoRedemptionForRestaurant({
        restaurantId: restaurant.id,
        promotionCode:
          typeof cs.metadata?.promotionCode === 'string'
            ? cs.metadata.promotionCode
            : null,
        stripeCouponIds: getStripeCouponIdsFromSubscription(subscription),
      })

      appliedFromCheckoutSession = true
      console.info('[billing] sync-from-stripe: wrote subscription from checkout session', {
        restaurantId: restaurant.id,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        payment_status: cs.payment_status,
      })

      await reconcileRestaurantMainSubscriptions({
        restaurantId: restaurant.id,
        stripeCustomerId: customerToStore,
        preferSubscriptionId: subscription.id,
      })
    } else if (restaurant.stripeCustomerId) {
      console.info('[billing] sync-from-stripe: reconcile only (no checkout session id)', {
        restaurantId,
        customerId: restaurant.stripeCustomerId,
      })
      await reconcileRestaurantMainSubscriptions({
        restaurantId: restaurant.id,
        stripeCustomerId: restaurant.stripeCustomerId,
      })
    } else {
      console.warn('[billing] sync-from-stripe: no stripe customer and no checkout session id', {
        restaurantId,
      })
      return NextResponse.json(
        { ok: false, isActive: false, reason: 'no_stripe_customer' },
        { status: 200 }
      )
    }

    const row = await prisma.restaurant.findUnique({
      where: { id: restaurant.id },
      select: {
        subscriptionStatus: true,
        stripeSubscriptionId: true,
        currentPeriodEnd: true,
      },
    })

    const isActive = isSubscriptionAccessActive(row?.subscriptionStatus)
    console.info('[billing] sync-from-stripe: done', {
      restaurantId,
      appliedFromCheckoutSession,
      subscriptionStatus: row?.subscriptionStatus,
      stripeSubscriptionId: row?.stripeSubscriptionId,
      isActive,
    })

    return NextResponse.json({
      ok: true,
      isActive,
      appliedFromCheckoutSession,
      subscriptionStatus: row?.subscriptionStatus ?? null,
      stripeSubscriptionId: row?.stripeSubscriptionId ?? null,
      currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
    })
  } catch (error) {
    console.error('[billing] sync-from-stripe error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
