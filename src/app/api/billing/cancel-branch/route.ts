import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import {
  findBranchSubscriptionItem,
  listCustomerSubscriptions,
  retrieveSubscription,
} from '@/lib/billing-branches'
import { getPlatformConfig } from '@/lib/platform-config'

/**
 * POST /api/billing/cancel-branch
 * Body: { branchId: string }
 * Deletes the branch and removes one $10/month charge from the subscription.
 * Only allowed when the restaurant has more than one branch.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const branchId = body.branchId

    if (!branchId) {
      return NextResponse.json({ error: 'branchId is required' }, { status: 400 })
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branchId, restaurantId: session.user.restaurantId },
    })

    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    const branchCount = await prisma.branch.count({
      where: { restaurantId: session.user.restaurantId },
    })

    if (branchCount <= 1) {
      return NextResponse.json(
        { error: 'You must have at least one branch. To close this location, add another branch first, then remove this one.' },
        { status: 403 }
      )
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { stripeSubscriptionId: true, stripeCustomerId: true },
    })

    const platformCfg = await getPlatformConfig()
    const stripeConfigured = !!(platformCfg.stripeSecretKey || process.env.STRIPE_SECRET_KEY)

    if ((restaurant?.stripeSubscriptionId || restaurant?.stripeCustomerId) && stripeConfigured) {
      const subscriptions = restaurant?.stripeCustomerId
        ? await listCustomerSubscriptions(restaurant.stripeCustomerId)
        : restaurant?.stripeSubscriptionId
          ? [await retrieveSubscription(restaurant.stripeSubscriptionId)]
          : []
      const branchSubscription = await findBranchSubscriptionItem(
        subscriptions,
        restaurant?.stripeSubscriptionId
      )
      if (branchSubscription) {
        const currentQty = branchSubscription.item.quantity ?? 0
        if (branchSubscription.subscription.id === restaurant?.stripeSubscriptionId) {
          if (currentQty > 1) {
            await stripe.subscriptionItems.update(branchSubscription.item.id, { quantity: currentQty - 1 })
          } else {
            await stripe.subscriptionItems.del(branchSubscription.item.id)
          }
        } else {
          await stripe.subscriptions.cancel(branchSubscription.subscription.id)
        }
      }
    }

    await prisma.table.updateMany({ where: { branchId: branch.id }, data: { branchId: null } })
    await prisma.sale.updateMany({ where: { branchId: branch.id }, data: { branchId: null } })
    await prisma.branch.delete({ where: { id: branch.id } })

    return NextResponse.json({ success: true, message: `Branch "${branch.name}" removed. Your next invoice will reflect the change.` })
  } catch (error) {
    console.error('Cancel branch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel branch' },
      { status: 500 }
    )
  }
}
