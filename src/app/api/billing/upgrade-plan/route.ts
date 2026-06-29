import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Stripe from 'stripe'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { getRestaurantPlanTier, normalizeProductPlanTier } from '@/lib/plan-features'
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

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const targetProductPlanTier = normalizeProductPlanTier(body.productPlanTier)
    if (targetProductPlanTier !== 'SMART_RESTAURANT_MANAGER') {
      return NextResponse.json({ error: 'Only Smart Restaurant Manager upgrades are supported here.' }, { status: 400 })
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
    if (getRestaurantPlanTier(restaurant) === 'SMART_RESTAURANT_MANAGER') {
      return NextResponse.json({ error: 'Your restaurant is already on Smart Restaurant Manager.' }, { status: 400 })
    }

    const settings = (restaurant.settings as Record<string, unknown> | null) || {}
    const billingPeriod =
      settings.subscriptionBillingPeriod === 'annual' || settings.subscriptionBillingPeriod === 'monthly'
        ? settings.subscriptionBillingPeriod
        : 'monthly'

    const subscription = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId)
    if (subscription.metadata?.kind === 'branch_addon') {
      return NextResponse.json({ error: 'Main restaurant subscription not found.' }, { status: 400 })
    }
    const mainItem = subscription.items.data[0]
    if (!mainItem) {
      return NextResponse.json({ error: 'Subscription has no main plan item.' }, { status: 400 })
    }
    const priceParams = await buildRestaurantManagerPriceParams(billingPeriod)
    if (!priceParams.price) {
      return NextResponse.json({ error: 'Could not prepare the Restaurant Manager price.' }, { status: 500 })
    }

    if (body.preview === true) {
      const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
        subscription: subscription.id,
        subscription_items: [
          {
            id: mainItem.id,
            price: priceParams.price,
          },
        ],
        subscription_proration_behavior: 'always_invoice',
      })
      const amountDue = upcomingInvoice.amount_due ?? 0
      const currency = upcomingInvoice.currency || BILLING_CURRENCY
      console.info('[billing] upgrade-plan preview', {
        restaurantId: restaurant.id,
        subscriptionId: subscription.id,
        billingPeriod,
        amountDue,
        amountDueFormatted: formatAmount(amountDue, currency),
        currency,
        invoiceStatus: upcomingInvoice.status,
      })

      return NextResponse.json({
        ok: true,
        preview: true,
        amountDue,
        amountDueFormatted: formatAmount(amountDue, currency),
        currency,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        isTrialing: subscription.status === 'trialing',
        message:
          amountDue > 0
            ? `Stripe will charge ${formatAmount(amountDue, currency)} now for the prorated upgrade.`
            : 'No immediate charge is due for this upgrade.',
      })
    }

    await stripe.subscriptionItems.update(mainItem.id, {
      price: priceParams.price,
      proration_behavior: 'always_invoice',
      payment_behavior: 'error_if_incomplete',
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

    const invoices = await stripe.invoices.list({ subscription: subscription.id, limit: 1 })
    const latestInvoice = invoices.data[0] ?? null
    console.info('[billing] upgrade-plan completed', {
      restaurantId: restaurant.id,
      subscriptionId: subscription.id,
      billingPeriod,
      latestInvoiceId: latestInvoice?.id ?? null,
      latestInvoiceStatus: latestInvoice?.status ?? null,
      latestInvoiceAmountDue: latestInvoice?.amount_due ?? null,
      latestInvoiceAmountPaid: latestInvoice?.amount_paid ?? null,
      latestInvoiceCurrency: latestInvoice?.currency ?? null,
    })

    return NextResponse.json({
      ok: true,
      productPlanTier: 'SMART_RESTAURANT_MANAGER',
      invoice: latestInvoice
        ? {
            id: latestInvoice.id,
            status: latestInvoice.status,
            amountDue: latestInvoice.amount_due,
            amountPaid: latestInvoice.amount_paid,
            amountPaidFormatted: formatAmount(latestInvoice.amount_paid ?? 0, latestInvoice.currency || BILLING_CURRENCY),
            currency: latestInvoice.currency,
          }
        : null,
      message: 'Smart Restaurant Manager is active. Stripe charged the prorated upgrade for the current billing period.',
    })
  } catch (error) {
    console.error('[billing] upgrade-plan error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not upgrade plan.' },
      { status: 500 }
    )
  }
}
