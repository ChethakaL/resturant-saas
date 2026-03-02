import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import Stripe from 'stripe'

const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY
const PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL
const BILLING_CURRENCY = (process.env.STRIPE_BILLING_CURRENCY || 'usd').toLowerCase()

function buildLineItem(
  configuredPrice: string,
  plan: 'monthly' | 'annual'
): Stripe.Checkout.SessionCreateParams.LineItem {
  const trimmed = configuredPrice.trim()

  if (/^price_/i.test(trimmed)) {
    return { price: trimmed, quantity: 1 }
  }

  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      `Invalid configured Stripe price "${configuredPrice}". Use a Stripe price ID (price_...) or a positive amount.`
    )
  }

  return {
    quantity: 1,
    price_data: {
      currency: BILLING_CURRENCY,
      unit_amount: Math.round(amount * 100),
      recurring: { interval: plan === 'annual' ? 'year' : 'month' },
      product_data: {
        name: plan === 'annual' ? 'Restaurant SaaS Annual Plan' : 'Restaurant SaaS Monthly Plan',
      },
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!PRICE_MONTHLY || !PRICE_ANNUAL) {
      return NextResponse.json(
        { error: 'Billing not configured. Set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL.' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const plan = body.plan === 'annual' ? 'annual' : 'monthly'
    const promotionCode = typeof body.promotionCode === 'string' ? body.promotionCode.trim().toUpperCase() : null
    const configuredPrice = plan === 'annual' ? PRICE_ANNUAL : PRICE_MONTHLY
    const lineItem = buildLineItem(configuredPrice, plan)

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { id: true, name: true, email: true, stripeCustomerId: true, stripeSubscriptionId: true },
    })
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    let customerId = restaurant.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: restaurant.email || undefined,
        name: restaurant.name,
        metadata: { restaurantId: restaurant.id },
      })
      customerId = customer.id
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { stripeCustomerId: customerId },
      })
    }

    let promoCouponId: string | null = null
    if (promotionCode) {
      const promo = await prisma.promoCode.findUnique({
        where: { code: promotionCode },
      })
      if (!promo) {
        return NextResponse.json({ error: 'Invalid promo code.' }, { status: 400 })
      }
      const alreadyRedeemed = await prisma.promoRedemption.findUnique({
        where: {
          promoCodeId_restaurantId: { promoCodeId: promo.id, restaurantId: session.user.restaurantId },
        },
      })
      if (alreadyRedeemed) {
        return NextResponse.json({ error: 'You have already used this promo code.' }, { status: 400 })
      }
      if (promo?.stripeCouponId && (!promo.maxRedemptions || promo.timesRedeemed < promo.maxRedemptions)) {
        promoCouponId = promo.stripeCouponId
      } else if (!promo.stripeCouponId) {
        return NextResponse.json({ error: 'This promo code is not properly configured.' }, { status: 400 })
      } else if (promo.maxRedemptions && promo.timesRedeemed >= promo.maxRedemptions) {
        return NextResponse.json({ error: 'This promo code has reached its usage limit.' }, { status: 400 })
      } else {
        return NextResponse.json({ error: 'Invalid promo code.' }, { status: 400 })
      }
    }

    const isFirstSubscription = !restaurant.stripeSubscriptionId
    const trialDays = isFirstSubscription && !promoCouponId ? 3 : undefined

    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const subscriptionData: Stripe.Checkout.SessionCreateParams['subscription_data'] = {
      metadata: { restaurantId: restaurant.id },
      ...(trialDays && { trial_period_days: trialDays }),
      ...(promoCouponId && { coupon: promoCouponId }),
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [lineItem],
      success_url: `${origin}/billing?success=true`,
      cancel_url: `${origin}/billing?canceled=true`,
      metadata: { restaurantId: restaurant.id, plan, ...(promotionCode && { promotionCode }) },
      subscription_data: subscriptionData,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Billing checkout error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
