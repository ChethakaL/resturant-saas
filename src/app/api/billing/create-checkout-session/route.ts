import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import Stripe from 'stripe'
import { getPlatformConfig } from '@/lib/platform-config'
import { reconcileRestaurantMainSubscriptions } from '@/lib/billing-subscription-sync'
import { isSubscriptionAccessActive, formatSubscriptionPeriodEnd } from '@/lib/subscription-status'
import { normalizeProductPlanTier } from '@/lib/plan-features'

const BILLING_CURRENCY = (process.env.STRIPE_BILLING_CURRENCY || 'usd').toLowerCase()
const RESTAURANT_MANAGER_MONTHLY = process.env.STRIPE_RESTAURANT_MANAGER_PRICE_MONTHLY || '200'
const RESTAURANT_MANAGER_ANNUAL = process.env.STRIPE_RESTAURANT_MANAGER_PRICE_ANNUAL || '2000'
const RESTAURANT_MANAGER_REFERRAL_MONTHLY = 34
const RESTAURANT_MANAGER_REFERRAL_ANNUAL = 340

function buildLineItem(
  configuredPrice: string,
  plan: 'monthly' | 'annual',
  referralDiscountAmount = 0
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
      unit_amount: Math.round(Math.max(0, amount - referralDiscountAmount) * 100),
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

    const platformCfg = await getPlatformConfig()
    const PRICE_MONTHLY = String(platformCfg.priceMonthly ?? process.env.STRIPE_PRICE_MONTHLY ?? '59')
    const PRICE_ANNUAL = String(platformCfg.priceAnnual ?? process.env.STRIPE_PRICE_ANNUAL ?? '590')
    const platformReferralDiscount = Number(platformCfg.referralDiscountAmount ?? 10)

    if (!PRICE_MONTHLY || !PRICE_ANNUAL) {
      return NextResponse.json(
        { error: 'Billing not configured. Set pricing in Platform Settings or .env.' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const plan = body.plan === 'annual' ? 'annual' : 'monthly'
    const productPlanTier =
      normalizeProductPlanTier(body.productPlanTier) ||
      normalizeProductPlanTier(body.tier) ||
      'SMART_MENU_MANAGER'
    const promotionCode = typeof body.promotionCode === 'string' ? body.promotionCode.trim().toUpperCase() : null
    const requestedReturnPath = typeof body.returnPath === 'string' ? body.returnPath.trim() : ''
    const returnPath =
      requestedReturnPath.startsWith('/') && !requestedReturnPath.startsWith('//')
        ? requestedReturnPath
        : '/billing'
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        id: true,
        name: true,
        email: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        referredByRestaurantId: true,
      },
    })
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    const isReferred = !!restaurant.referredByRestaurantId
    const referralDiscount = isReferred
      ? productPlanTier === 'SMART_RESTAURANT_MANAGER'
        ? plan === 'annual'
          ? RESTAURANT_MANAGER_REFERRAL_ANNUAL
          : RESTAURANT_MANAGER_REFERRAL_MONTHLY
        : plan === 'annual'
          ? 100
          : platformReferralDiscount
      : 0

    const configuredPrice =
      productPlanTier === 'SMART_RESTAURANT_MANAGER'
        ? plan === 'annual'
          ? RESTAURANT_MANAGER_ANNUAL
          : RESTAURANT_MANAGER_MONTHLY
        : plan === 'annual'
          ? PRICE_ANNUAL
          : PRICE_MONTHLY
    const lineItem = buildLineItem(configuredPrice, plan, referralDiscount)

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

    const recon = await reconcileRestaurantMainSubscriptions({
      restaurantId: restaurant.id,
      stripeCustomerId: customerId,
    })
    if (recon.synced && recon.primaryStatus && isSubscriptionAccessActive(recon.primaryStatus)) {
      const until = formatSubscriptionPeriodEnd(recon.currentPeriodEnd, 'en-US')
      return NextResponse.json(
        {
          error: 'You already have an active subscription for this restaurant.',
          code: 'ALREADY_SUBSCRIBED',
          currentPeriodEnd: recon.currentPeriodEnd,
          message: until
            ? `You already have an active subscription through ${until}.`
            : 'You already have an active subscription for this restaurant.',
        },
        { status: 409 }
      )
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

    const freshSub = await prisma.restaurant.findUnique({
      where: { id: restaurant.id },
      select: { stripeSubscriptionId: true },
    })
    const isFirstSubscription = !freshSub?.stripeSubscriptionId
    const trialDays = isFirstSubscription && !promoCouponId ? 3 : undefined

    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const returnSep = returnPath.includes('?') ? '&' : '?'
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [lineItem],
      // Stripe doesn't allow both allow_promotion_codes and discounts in the same session.
      // If we have a pre-applied promo, we use discounts. Otherwise, we allow the user to enter one.
      ...(promoCouponId 
        ? { discounts: [{ coupon: promoCouponId }] }
        : { allow_promotion_codes: true }
      ),
      // session_id lets the app sync Postgres when webhooks do not reach this host (e.g. local dev).
      success_url: `${origin}${returnPath}${returnSep}success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}${returnSep}canceled=true`,
      metadata: { restaurantId: restaurant.id, plan, productPlanTier, ...(promotionCode && { promotionCode }) },
      subscription_data: {
        metadata: { restaurantId: restaurant.id, plan, productPlanTier },
        ...(trialDays && { trial_period_days: trialDays }),
      },
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
