import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Stripe from 'stripe'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { getRestaurantPlanTier } from '@/lib/plan-features'
import { isSubscriptionAccessActive } from '@/lib/subscription-status'

const BILLING_CURRENCY = (process.env.STRIPE_BILLING_CURRENCY || 'usd').toLowerCase()
const RESTAURANT_MANAGER_MONTHLY = process.env.STRIPE_RESTAURANT_MANAGER_PRICE_MONTHLY || '200'
const RESTAURANT_MANAGER_ANNUAL = process.env.STRIPE_RESTAURANT_MANAGER_PRICE_ANNUAL || '2000'

async function buildRestaurantManagerPriceParams(
  plan: 'monthly' | 'annual'
): Promise<Pick<Stripe.SubscriptionItemUpdateParams, 'price'>> {
  const configuredPrice = plan === 'annual' ? RESTAURANT_MANAGER_ANNUAL : RESTAURANT_MANAGER_MONTHLY
  const trimmed = configuredPrice.trim()
  if (/^price_/i.test(trimmed)) {
    return { price: trimmed }
  }

  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid configured Stripe price "${configuredPrice}".`)
  }

  const product = await stripe.products.create({
    name: 'Smart Restaurant Manager',
    metadata: { productPlanTier: 'SMART_RESTAURANT_MANAGER' },
  })
  const price = await stripe.prices.create({
    currency: BILLING_CURRENCY,
    unit_amount: Math.round(amount * 100),
    recurring: { interval: plan === 'annual' ? 'year' : 'month' },
    product: product.id,
    metadata: {
      productPlanTier: 'SMART_RESTAURANT_MANAGER',
      plan,
    },
  })

  return { price: price.id }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        id: true,
        settings: true,
        subscriptionStatus: true,
        stripeSubscriptionId: true,
      },
    })
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }
    if (!isSubscriptionAccessActive(restaurant.subscriptionStatus) || !restaurant.stripeSubscriptionId) {
      return NextResponse.json({ error: 'Active subscription required.' }, { status: 403 })
    }
    if (getRestaurantPlanTier(restaurant) !== 'SMART_RESTAURANT_MANAGER') {
      return NextResponse.json({ error: 'Your restaurant is not currently on Smart Restaurant Manager.' }, { status: 400 })
    }

    const settings = (restaurant.settings as Record<string, unknown> | null) || {}
    if (settings.pendingProductPlanTier !== 'SMART_MENU_MANAGER') {
      return NextResponse.json({ error: 'No scheduled downgrade found.' }, { status: 400 })
    }

    const billingPeriod =
      settings.subscriptionBillingPeriod === 'annual' || settings.subscriptionBillingPeriod === 'monthly'
        ? settings.subscriptionBillingPeriod
        : 'monthly'

    const subscription = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId)
    const mainItem = subscription.items.data[0]
    if (!mainItem) {
      return NextResponse.json({ error: 'Subscription has no main plan item.' }, { status: 400 })
    }

    await stripe.subscriptionItems.update(mainItem.id, {
      ...(await buildRestaurantManagerPriceParams(billingPeriod)),
      proration_behavior: 'none',
      metadata: {
        ...mainItem.metadata,
        scheduledProductPlanTier: '',
      },
    })

    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        productPlanTier: 'SMART_RESTAURANT_MANAGER',
        plan: billingPeriod,
        pendingProductPlanTier: '',
        pendingProductPlanTierEffectiveAt: '',
      },
      proration_behavior: 'none',
    })

    const {
      pendingProductPlanTier,
      pendingProductPlanTierEffectiveAt,
      ...nextSettings
    } = settings

    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        settings: {
          ...nextSettings,
          productPlanTier: 'SMART_RESTAURANT_MANAGER',
          subscriptionBillingPeriod: billingPeriod,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Scheduled downgrade canceled. Smart Restaurant Manager remains active.',
    })
  } catch (error) {
    console.error('[billing] cancel-scheduled-plan-change error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not cancel scheduled downgrade.' },
      { status: 500 }
    )
  }
}
