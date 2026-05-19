import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { getBranchBillingConfig } from '@/lib/branch-billing'
import {
  getBranchCapacityForRestaurant,
  incrementPaidBranchSlots,
} from '@/lib/billing-branches'

const LOG = '[billing/branch-slot]'

/**
 * POST /api/billing/purchase-branch-slot
 * Adds an extra branch slot using the price from Platform Settings ($/month).
 */
export async function POST() {
  let restaurantId: string | undefined

  try {
    const session = await getServerSession(authOptions)
    restaurantId = session?.user?.restaurantId
    if (!restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const branchBilling = await getBranchBillingConfig()

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
        settings: true,
      },
    })

    if (!restaurant?.stripeSubscriptionId) {
      console.warn(LOG, 'blocked — no subscription', { restaurantId: restaurant?.id })
      return NextResponse.json(
        { error: 'Active subscription required. Subscribe first to add branch slots.' },
        { status: 403 }
      )
    }

    const capacity = await getBranchCapacityForRestaurant({
      stripeCustomerId: restaurant.stripeCustomerId,
      stripeSubscriptionId: restaurant.stripeSubscriptionId,
      settings: restaurant.settings,
      branchBilling,
    })

    const branchCount = await prisma.branch.count({
      where: { restaurantId },
    })

    console.info(LOG, 'purchase requested', {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      stripeSubscriptionId: restaurant.stripeSubscriptionId,
      stripeCustomerId: restaurant.stripeCustomerId,
      branchCount,
      maxBranchesBefore: capacity.maxBranches,
      branchPriceUsd: branchBilling.branchPriceUsd,
    })

    if (branchCount < capacity.maxBranches) {
      console.warn(LOG, 'blocked — unused slot available', {
        restaurantId: restaurant.id,
        branchCount,
        maxBranches: capacity.maxBranches,
      })
      return NextResponse.json(
        {
          error: 'You already have an unused branch slot. Use Add Branch to create it.',
          maxBranches: capacity.maxBranches,
        },
        { status: 400 }
      )
    }

    const stripeResult = await incrementPaidBranchSlots(
      restaurant.stripeSubscriptionId,
      1,
      branchBilling
    )

    const updated = await getBranchCapacityForRestaurant({
      stripeCustomerId: restaurant.stripeCustomerId,
      stripeSubscriptionId: restaurant.stripeSubscriptionId,
      settings: restaurant.settings,
      branchBilling,
    })

    let recentInvoices: Array<{
      id: string
      status: string | null
      amountDue: number
      amountPaid: number
      billingReason: string | null
      created: number
    }> = []

    if (restaurant.stripeCustomerId) {
      const invoices = await stripe.invoices.list({
        customer: restaurant.stripeCustomerId,
        limit: 5,
      })
      recentInvoices = invoices.data.map((inv) => ({
        id: inv.id,
        status: inv.status,
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        billingReason: inv.billing_reason,
        created: inv.created,
      }))
    }

    console.info(LOG, 'purchase completed', {
      restaurantId: restaurant.id,
      stripeResult,
      maxBranchesAfter: updated.maxBranches,
      extraBranchSlotsAfter: updated.extraBranchSlots,
      recentInvoices,
    })

    return NextResponse.json({
      success: true,
      maxBranches: updated.maxBranches,
      branchPriceUsd: branchBilling.branchPriceUsd,
      message: `Branch slot added ($${branchBilling.branchPriceUsd}/month). You can now create your new branch.`,
    })
  } catch (error) {
    console.error(LOG, 'purchase failed', {
      restaurantId,
      error: error instanceof Error ? error.message : error,
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to purchase branch slot' },
      { status: 500 }
    )
  }
}
