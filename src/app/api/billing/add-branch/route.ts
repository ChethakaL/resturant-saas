import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBranchBillingConfig } from '@/lib/branch-billing'
import {
  getBranchCapacityForRestaurant,
  incrementPaidBranchSlots,
} from '@/lib/billing-branches'

/**
 * POST /api/billing/add-branch
 * Creates a branch; adds the Platform Settings branch price to Stripe when needed.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const branchBilling = await getBranchBillingConfig()

    const body = await request.json()
    const name = body.name?.trim()
    const address = body.address?.trim() || null
    const phone = body.phone?.trim() || null

    if (!name) {
      return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { id: true, stripeSubscriptionId: true, stripeCustomerId: true, settings: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    if (!restaurant.stripeSubscriptionId && !restaurant.stripeCustomerId) {
      return NextResponse.json(
        { error: 'Active subscription required. Subscribe first to add branches.' },
        { status: 403 }
      )
    }

    const currentBranchCount = await prisma.branch.count({
      where: { restaurantId: session.user.restaurantId },
    })

    const capacity = await getBranchCapacityForRestaurant({
      stripeCustomerId: restaurant.stripeCustomerId,
      stripeSubscriptionId: restaurant.stripeSubscriptionId,
      settings: restaurant.settings,
      branchBilling,
    })
    const maxBranches = capacity.maxBranches

    if (currentBranchCount >= maxBranches) {
      return NextResponse.json(
        {
          error: `Branch limit reached (${maxBranches}). Each extra branch is $${branchBilling.branchPriceUsd}/month — add a branch slot first.`,
        },
        { status: 403 }
      )
    }

    const requiredPaidForNewBranch = currentBranchCount
    const delta = requiredPaidForNewBranch - capacity.extraBranchSlots

    if (delta > 0) {
      if (!restaurant.stripeSubscriptionId) {
        return NextResponse.json(
          { error: 'Branch payment is required before you can add this branch.' },
          { status: 403 }
        )
      }

      await incrementPaidBranchSlots(
        restaurant.stripeSubscriptionId,
        delta,
        branchBilling
      )
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
