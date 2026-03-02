import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

const STRIPE_PRICE_BRANCH = process.env.STRIPE_PRICE_BRANCH

/**
 * POST /api/billing/upgrade-for-branch
 * Adds 1 extra branch slot ($10/mo) to the subscription.
 * Call this when at branch limit; then user can add the branch.
 */
export async function POST() {
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
      select: { stripeSubscriptionId: true },
    })

    if (!restaurant?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'Active subscription required. Subscribe first.' },
        { status: 403 }
      )
    }

    const subscription = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId)
    if (!['active', 'trialing'].includes(subscription.status)) {
      return NextResponse.json(
        { error: 'Your subscription is not active. Renew first.' },
        { status: 403 }
      )
    }

    const branchItem = subscription.items.data.find((item) => item.price.id === STRIPE_PRICE_BRANCH)
    if (branchItem) {
      await stripe.subscriptionItems.update(branchItem.id, {
        quantity: (branchItem.quantity ?? 0) + 1,
      })
    } else {
      await stripe.subscriptionItems.create({
        subscription: restaurant.stripeSubscriptionId,
        price: STRIPE_PRICE_BRANCH,
        quantity: 1,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription updated. You can now add a new branch.',
    })
  } catch (error) {
    console.error('Upgrade for branch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upgrade' },
      { status: 500 }
    )
  }
}
