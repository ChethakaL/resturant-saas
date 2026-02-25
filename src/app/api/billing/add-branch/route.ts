import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

const STRIPE_PRICE_BRANCH = process.env.STRIPE_PRICE_BRANCH

/**
 * POST /api/billing/add-branch
 * Adds an extra branch: creates a Stripe subscription item for $10/mo (if not already at limit)
 * and creates the branch. Requires an active subscription.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!STRIPE_PRICE_BRANCH?.trim()) {
      return NextResponse.json(
        { error: 'Branch add-on not configured. Set STRIPE_PRICE_BRANCH to a Stripe price ID ($10/month).' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const name = body.name?.trim()
    const address = body.address?.trim() || null
    const phone = body.phone?.trim() || null

    if (!name) {
      return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { id: true, stripeSubscriptionId: true, settings: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    if (!restaurant.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'Active subscription required. Subscribe first to add branches.' },
        { status: 403 }
      )
    }

    const subscription = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId)
    if (!['active', 'trialing'].includes(subscription.status)) {
      return NextResponse.json(
        { error: 'Your subscription is not active. Renew to add branches.' },
        { status: 403 }
      )
    }

    const currentBranchCount = await prisma.branch.count({
      where: { restaurantId: session.user.restaurantId },
    })

    const branchItem = subscription.items.data.find((item) => item.price.id === STRIPE_PRICE_BRANCH)
    const paidExtraBranches = branchItem ? (branchItem.quantity ?? 0) : 0
    const maxBranches = 1 + paidExtraBranches

    if (currentBranchCount >= maxBranches) {
      return NextResponse.json(
        { error: `Branch limit reached (${maxBranches}). Each extra branch is $10/month — add payment to continue.` },
        { status: 403 }
      )
    }

    const requiredPaidForNewBranch = currentBranchCount
    const delta = requiredPaidForNewBranch - paidExtraBranches

    if (delta > 0) {
      if (branchItem) {
        await stripe.subscriptionItems.update(branchItem.id, {
          quantity: (branchItem.quantity ?? 0) + delta,
        })
      } else {
        await stripe.subscriptionItems.create({
          subscription: restaurant.stripeSubscriptionId,
          price: STRIPE_PRICE_BRANCH,
          quantity: delta,
        })
      }
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        address,
        phone,
        restaurantId: session.user.restaurantId,
      },
    })

    return NextResponse.json(branch)
  } catch (error) {
    console.error('Add branch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add branch' },
      { status: 500 }
    )
  }
}
