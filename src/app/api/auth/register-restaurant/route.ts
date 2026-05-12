import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { getPlatformConfig } from '@/lib/platform-config'
import { mergeRestaurantWhatsAppSettings, normalizeWhatsAppNumber } from '@/lib/restaurant-whatsapp'

const BILLING_CURRENCY = (process.env.STRIPE_BILLING_CURRENCY || 'usd').toLowerCase()

function buildSignupLineItem(
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
    throw new Error(`Invalid configured Stripe price "${configuredPrice}".`)
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function cleanupFailedSignup(restaurantId: string, stripeCustomerId?: string | null) {
  try {
    await prisma.restaurant.delete({ where: { id: restaurantId } })
  } catch (error) {
    console.error('Failed to cleanup restaurant after signup checkout failure:', error)
  }

  if (stripeCustomerId) {
    try {
      await stripe.customers.del(stripeCustomerId)
    } catch (error) {
      console.warn('Failed to delete Stripe customer after signup checkout failure:', error)
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      restaurantName,
      slug: slugInput,
      userName,
      userEmail,
      restaurantWhatsappNumber,
      password,
      referralCode: refCode,
      plan: planInput,
      promotionCode: promotionCodeInput,
    } = body as {
      restaurantName?: string
      slug?: string
      userName?: string
      userEmail?: string
      restaurantWhatsappNumber?: string
      password?: string
      referralCode?: string
      plan?: string
      promotionCode?: string
    }
    const plan = planInput === 'annual' ? 'annual' : 'monthly'
    const promotionCode = typeof promotionCodeInput === 'string' ? promotionCodeInput.trim().toUpperCase() : null

    if (!restaurantName?.trim()) {
      return NextResponse.json(
        { error: 'Restaurant name is required' },
        { status: 400 }
      )
    }
    if (!userName?.trim() || !userEmail?.trim() || !password) {
      return NextResponse.json(
        { error: 'Owner name, email, and password are required' },
        { status: 400 }
      )
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const slug = (slugInput?.trim() || slugify(restaurantName)).toLowerCase()
    if (!slug) {
      return NextResponse.json(
        { error: 'Could not generate a valid slug from restaurant name' },
        { status: 400 }
      )
    }

    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { slug },
    })
    if (existingRestaurant) {
      return NextResponse.json(
        { error: 'A restaurant with this name/slug already exists. Try a different name or slug.' },
        { status: 409 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: userEmail.trim().toLowerCase() },
    })
    if (existingUser) {
      return NextResponse.json(
        { error: 'This email is already registered as a restaurant user.' },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const normalizedWhatsappNumber = normalizeWhatsAppNumber(restaurantWhatsappNumber)

    let referredByRestaurantId: string | null = null
    if (refCode?.trim()) {
      const referrer = await prisma.restaurant.findUnique({
        where: { referralCode: refCode.trim().toUpperCase() },
        select: { id: true },
      })
      if (referrer) referredByRestaurantId = referrer.id
    }

    let promoCouponId: string | null = null
    if (promotionCode) {
      const promo = await prisma.promoCode.findUnique({ where: { code: promotionCode } })
      if (!promo) {
        return NextResponse.json({ error: 'Invalid promo code.' }, { status: 400 })
      }
      if (!promo.stripeCouponId) {
        return NextResponse.json({ error: 'This promo code is not properly configured.' }, { status: 400 })
      }
      if (promo.maxRedemptions != null && promo.timesRedeemed >= promo.maxRedemptions) {
        return NextResponse.json({ error: 'This promo code has reached its usage limit.' }, { status: 400 })
      }
      promoCouponId = promo.stripeCouponId
      try {
        await stripe.coupons.retrieve(promoCouponId)
      } catch {
        return NextResponse.json(
          { error: 'This promo code is not available for the current Stripe mode. Please update the promo coupon or use another code.' },
          { status: 400 }
        )
      }
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantName.trim(),
        slug,
        email: userEmail.trim().toLowerCase(),
        settings: normalizedWhatsappNumber
          ? mergeRestaurantWhatsAppSettings({}, { number: normalizedWhatsappNumber })
          : undefined,
        ...(referredByRestaurantId && { referredByRestaurantId }),
      },
    })

    await prisma.user.create({
      data: {
        email: userEmail.trim().toLowerCase(),
        password: hashedPassword,
        name: userName.trim(),
        role: 'OWNER',
        restaurantId: restaurant.id,
      },
    })

    let checkoutUrl: string | null = null
    let customerId: string | null = null
    try {
      const platformCfg = await getPlatformConfig()
      const priceMonthly = String(platformCfg.priceMonthly ?? process.env.STRIPE_PRICE_MONTHLY ?? '59')
      const priceAnnual = String(platformCfg.priceAnnual ?? process.env.STRIPE_PRICE_ANNUAL ?? '590')
      const platformReferralDiscount = Number(platformCfg.referralDiscountAmount ?? 10)
      const referralDiscount = referredByRestaurantId ? (plan === 'annual' ? 100 : platformReferralDiscount) : 0
      const configuredPrice = plan === 'annual' ? priceAnnual : priceMonthly

      const customer = await stripe.customers.create({
        email: restaurant.email || undefined,
        name: restaurant.name,
        metadata: { restaurantId: restaurant.id },
      })
      customerId = customer.id
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { stripeCustomerId: customer.id },
      })

      const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customer.id,
        mode: 'subscription',
        line_items: [buildSignupLineItem(configuredPrice, plan, referralDiscount)],
        ...(promoCouponId
          ? { discounts: [{ coupon: promoCouponId }] }
          : { allow_promotion_codes: true }),
        success_url: `${origin}/login?registered=1&payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/login?registered=1&payment=canceled`,
        metadata: { restaurantId: restaurant.id, plan, ...(promotionCode && { promotionCode }) },
        subscription_data: {
          metadata: { restaurantId: restaurant.id },
          trial_period_days: 3,
        },
      })
      checkoutUrl = checkoutSession.url
    } catch (error) {
      console.error('Signup checkout creation failed:', error)
      await cleanupFailedSignup(restaurant.id, customerId)
      return NextResponse.json(
        {
          error: error instanceof Error
            ? error.message
            : 'Could not start Stripe checkout. No account was created. Please try again.',
        },
        { status: 500 }
      )
    }

    if (!checkoutUrl) {
      await cleanupFailedSignup(restaurant.id, customerId)
      return NextResponse.json(
        { error: 'Stripe did not return a checkout URL. No account was created. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Restaurant registered. Continue to payment.',
      slug: restaurant.slug,
      checkoutUrl,
    })
  } catch (error) {
    console.error('Register restaurant error:', error)
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    )
  }
}
