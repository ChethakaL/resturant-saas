import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import Stripe from 'stripe'

const STRIPE_PRICE_BRANCH = process.env.STRIPE_PRICE_BRANCH
const BILLING_CURRENCY = (process.env.STRIPE_BILLING_CURRENCY || 'usd').toLowerCase()

function buildBranchLineItem(configuredPrice: string): Stripe.Checkout.SessionCreateParams.LineItem {
  const trimmed = configuredPrice.trim()

  if (/^price_/i.test(trimmed)) {
    return { price: trimmed, quantity: 1 }
  }

  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      `Invalid configured Stripe branch price "${configuredPrice}". Use a Stripe price ID (price_...) or a positive amount.`
    )
  }

  return {
    quantity: 1,
    price_data: {
      currency: BILLING_CURRENCY,
      unit_amount: Math.round(amount * 100),
      recurring: { interval: 'month' },
      product_data: {
        name: 'Restaurant SaaS Branch Add-on',
      },
    },
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!STRIPE_PRICE_BRANCH?.trim()) {
      return NextResponse.json(
        { error: 'Branch add-on not configured. Set STRIPE_PRICE_BRANCH in .env' },
        { status: 500 }
      )
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { id: true, name: true, email: true, stripeSubscriptionId: true, stripeCustomerId: true },
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

    if (!restaurant.stripeSubscriptionId) {
      const lineItem = buildBranchLineItem(STRIPE_PRICE_BRANCH)
      const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [lineItem],
        success_url: `${origin}/billing?branchUpgradeSuccess=true`,
        cancel_url: `${origin}/billing?branchUpgradeCanceled=true`,
        metadata: { restaurantId: restaurant.id, kind: 'branch_addon' },
        subscription_data: {
          metadata: { restaurantId: restaurant.id, kind: 'branch_addon' },
        },
      })

      return NextResponse.json({
        success: true,
        mode: 'checkout',
        url: checkoutSession.url,
      })
    }

    const subscription = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId)
    if (!['active', 'trialing'].includes(subscription.status)) {
      return NextResponse.json(
        { error: 'Your subscription is not active. Renew first.' },
        { status: 403 }
      )
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${request.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'}/billing`,
    })

    return NextResponse.json({
      success: true,
      mode: 'portal',
      url: portalSession.url,
    })
  } catch (error) {
    console.error('Upgrade for branch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upgrade' },
      { status: 500 }
    )
  }
}
