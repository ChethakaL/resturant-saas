import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { getBranchBillingConfig, BRANCH_ADDON_PRODUCT_NAME } from '@/lib/branch-billing'
import {
  getBranchCapacityForRestaurant,
  incrementPaidBranchSlots,
} from '@/lib/billing-branches'
import Stripe from 'stripe'

const BILLING_CURRENCY = (process.env.STRIPE_BILLING_CURRENCY || 'usd').toLowerCase()

function buildBranchCheckoutLineItem(
  branchBilling: Awaited<ReturnType<typeof getBranchBillingConfig>>
): Stripe.Checkout.SessionCreateParams.LineItem {
  if (branchBilling.branchPriceId) {
    return { price: branchBilling.branchPriceId, quantity: 1 }
  }

  return {
    quantity: 1,
    price_data: {
      currency: BILLING_CURRENCY,
      unit_amount: Math.round(branchBilling.branchPriceUsd * 100),
      recurring: { interval: 'month' },
      product_data: {
        name: BRANCH_ADDON_PRODUCT_NAME,
        metadata: { kind: 'branch_addon' },
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

    const branchBilling = await getBranchBillingConfig()

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        id: true,
        name: true,
        email: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
        settings: true,
      },
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
      const lineItem = buildBranchCheckoutLineItem(branchBilling)
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

    const capacity = await getBranchCapacityForRestaurant({
      stripeCustomerId: customerId,
      stripeSubscriptionId: restaurant.stripeSubscriptionId,
      settings: restaurant.settings,
      branchBilling,
    })

    const branchCount = await prisma.branch.count({
      where: { restaurantId: restaurant.id },
    })

    if (branchCount >= capacity.maxBranches) {
      await incrementPaidBranchSlots(
        restaurant.stripeSubscriptionId,
        1,
        branchBilling
      )
    }

    const updated = await getBranchCapacityForRestaurant({
      stripeCustomerId: customerId,
      stripeSubscriptionId: restaurant.stripeSubscriptionId,
      settings: restaurant.settings,
      branchBilling,
    })

    return NextResponse.json({
      success: true,
      mode: 'immediate',
      maxBranches: updated.maxBranches,
      branchPriceUsd: branchBilling.branchPriceUsd,
    })
  } catch (error) {
    console.error('Upgrade for branch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upgrade' },
      { status: 500 }
    )
  }
}
