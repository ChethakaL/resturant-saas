import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { getBranchBillingConfig } from '@/lib/branch-billing'
import {
  findBranchSubscriptionItem,
  getBranchCapacityForRestaurant,
  listCustomerSubscriptions,
  retrieveSubscription,
} from '@/lib/billing-branches'
import { getPlatformConfig } from '@/lib/platform-config'

const LOG = '[billing/release-branch-slot]'

/**
 * POST /api/billing/release-branch-slot
 * Stops billing for one unused paid branch slot (does not delete any branch record).
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const branchBilling = await getBranchBillingConfig()
    const platformCfg = await getPlatformConfig()
    const stripeConfigured = !!(platformCfg.stripeSecretKey || process.env.STRIPE_SECRET_KEY)

    if (!stripeConfigured) {
      return NextResponse.json({ error: 'Stripe billing is not configured.' }, { status: 500 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { stripeSubscriptionId: true, stripeCustomerId: true, settings: true },
    })

    if (!restaurant?.stripeSubscriptionId && !restaurant?.stripeCustomerId) {
      return NextResponse.json({ error: 'Active subscription required.' }, { status: 403 })
    }

    const capacity = await getBranchCapacityForRestaurant({
      stripeCustomerId: restaurant.stripeCustomerId,
      stripeSubscriptionId: restaurant.stripeSubscriptionId,
      settings: restaurant.settings,
      branchBilling,
    })

    const branchCount = await prisma.branch.count({
      where: { restaurantId: session.user.restaurantId },
    })

    const unusedSlots = capacity.maxBranches - branchCount

    console.info(LOG, 'release requested', {
      restaurantId: session.user.restaurantId,
      branchCount,
      maxBranches: capacity.maxBranches,
      unusedSlots,
    })

    if (unusedSlots <= 0) {
      return NextResponse.json(
        {
          error:
            'No unused paid branch slots. Delete a branch first or all slots are already in use.',
        },
        { status: 400 }
      )
    }

    const subscriptions = restaurant.stripeCustomerId
      ? await listCustomerSubscriptions(restaurant.stripeCustomerId)
      : restaurant.stripeSubscriptionId
        ? [await retrieveSubscription(restaurant.stripeSubscriptionId)]
        : []

    const branchSubscription = await findBranchSubscriptionItem(
      subscriptions,
      restaurant.stripeSubscriptionId
    )

    if (!branchSubscription) {
      return NextResponse.json(
        { error: 'No branch add-on found on your subscription.' },
        { status: 400 }
      )
    }

    const currentQty = branchSubscription.item.quantity ?? 0

    if (branchSubscription.subscription.id === restaurant.stripeSubscriptionId) {
      if (currentQty > 1) {
        await stripe.subscriptionItems.update(branchSubscription.item.id, {
          quantity: currentQty - 1,
        })
      } else {
        await stripe.subscriptionItems.del(branchSubscription.item.id)
      }
    } else {
      await stripe.subscriptions.cancel(branchSubscription.subscription.id)
    }

    const updated = await getBranchCapacityForRestaurant({
      stripeCustomerId: restaurant.stripeCustomerId,
      stripeSubscriptionId: restaurant.stripeSubscriptionId,
      settings: restaurant.settings,
      branchBilling,
    })

    console.info(LOG, 'release completed', {
      restaurantId: session.user.restaurantId,
      maxBranchesAfter: updated.maxBranches,
      branchCount,
    })

    return NextResponse.json({
      success: true,
      maxBranches: updated.maxBranches,
      message: `Unused branch slot released. You will no longer be charged $${branchBilling.branchPriceUsd}/month for that slot.`,
    })
  } catch (error) {
    console.error(LOG, 'release failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to release branch slot' },
      { status: 500 }
    )
  }
}
