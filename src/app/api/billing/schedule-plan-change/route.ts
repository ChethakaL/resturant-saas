import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Stripe from 'stripe'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { getPlatformConfig } from '@/lib/platform-config'
import { getRestaurantPlanTier, normalizeProductPlanTier } from '@/lib/plan-features'
import { isSubscriptionAccessActive } from '@/lib/subscription-status'

const BILLING_CURRENCY = (process.env.STRIPE_BILLING_CURRENCY || 'usd').toLowerCase()

async function buildSubscriptionItemPriceParams(
  configuredPrice: string,
  plan: 'monthly' | 'annual'
): Promise<Pick<Stripe.SubscriptionItemUpdateParams, 'price'>> {
  const trimmed = configuredPrice.trim()
  if (/^price_/i.test(trimmed)) {
    return { price: trimmed }
  }

  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid configured Stripe price "${configuredPrice}".`)
  }

  const product = await stripe.products.create({
    name: 'Smart Menu Manager',
    metadata: { productPlanTier: 'SMART_MENU_MANAGER' },
  })
  const price = await stripe.prices.create({
    currency: BILLING_CURRENCY,
    unit_amount: Math.round(amount * 100),
    recurring: { interval: plan === 'annual' ? 'year' : 'month' },
    product: product.id,
    metadata: {
      productPlanTier: 'SMART_MENU_MANAGER',
      plan,
    },
  })

  return { price: price.id }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const targetProductPlanTier = normalizeProductPlanTier(body.productPlanTier)
    if (targetProductPlanTier !== 'SMART_MENU_MANAGER') {
      return NextResponse.json({ error: 'Only Smart Menu Manager downgrades are supported here.' }, { status: 400 })
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
      return NextResponse.json({ error: 'Your restaurant is not on Smart Restaurant Manager.' }, { status: 400 })
    }

    const settings = (restaurant.settings as Record<string, unknown> | null) || {}
    const currentBillingPeriod =
      settings.subscriptionBillingPeriod === 'annual' || settings.subscriptionBillingPeriod === 'monthly'
        ? settings.subscriptionBillingPeriod
        : 'monthly'

    const platformCfg = await getPlatformConfig()
    const menuPrice =
      currentBillingPeriod === 'annual'
        ? String(platformCfg.priceAnnual ?? process.env.STRIPE_PRICE_ANNUAL ?? '590')
        : String(platformCfg.priceMonthly ?? process.env.STRIPE_PRICE_MONTHLY ?? '59')

    const subscription = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId)
    if (subscription.metadata?.kind === 'branch_addon') {
      return NextResponse.json({ error: 'Main restaurant subscription not found.' }, { status: 400 })
    }
    const mainItem = subscription.items.data[0]
    if (!mainItem) {
      return NextResponse.json({ error: 'Subscription has no main plan item.' }, { status: 400 })
    }

    await stripe.subscriptionItems.update(mainItem.id, {
      ...(await buildSubscriptionItemPriceParams(menuPrice, currentBillingPeriod)),
      proration_behavior: 'none',
      metadata: {
        ...mainItem.metadata,
        scheduledProductPlanTier: 'SMART_MENU_MANAGER',
      },
    })

    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        pendingProductPlanTier: 'SMART_MENU_MANAGER',
        pendingProductPlanTierEffectiveAt: new Date(subscription.current_period_end * 1000).toISOString(),
        plan: currentBillingPeriod,
      },
      proration_behavior: 'none',
    })

    const effectiveAt = new Date(subscription.current_period_end * 1000)
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        settings: {
          ...settings,
          pendingProductPlanTier: 'SMART_MENU_MANAGER',
          pendingProductPlanTierEffectiveAt: effectiveAt.toISOString(),
          subscriptionBillingPeriod: currentBillingPeriod,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      pendingProductPlanTier: 'SMART_MENU_MANAGER',
      effectiveAt: effectiveAt.toISOString(),
      message: `Downgrade scheduled for ${effectiveAt.toLocaleDateString('en-US')}.`,
    })
  } catch (error) {
    console.error('[billing] schedule-plan-change error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not schedule plan change.' },
      { status: 500 }
    )
  }
}
