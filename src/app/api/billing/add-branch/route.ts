import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBranchBillingConfig } from '@/lib/branch-billing'
import { getBranchCapacityForRestaurant } from '@/lib/billing-branches'

/**
 * POST /api/billing/add-branch
 * Creates a branch only when a paid branch slot exists (purchase via purchase-branch-slot first).
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

    if (maxBranches <= 0) {
      return NextResponse.json(
        {
          error: `Each branch costs $${branchBilling.branchPriceUsd}/month. Purchase a branch slot on the Billing page first.`,
        },
        { status: 403 }
      )
    }

    if (currentBranchCount >= maxBranches) {
      return NextResponse.json(
        {
          error: `Branch limit reached (${maxBranches}). Each branch is $${branchBilling.branchPriceUsd}/month — purchase another branch slot first.`,
        },
        { status: 403 }
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
