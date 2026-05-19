/**
 * Verifies Stripe branch billing (no HTTP session required).
 * Run: npx tsx scripts/verify-branch-billing.ts
 */
import { prisma } from '../src/lib/prisma'
import { getBranchBillingConfig } from '../src/lib/branch-billing'
import {
  getBranchCapacityForRestaurant,
  incrementPaidBranchSlots,
  retrieveSubscription,
} from '../src/lib/billing-branches'

async function main() {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    console.error('FAIL: STRIPE_SECRET_KEY is not set')
    process.exit(1)
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { stripeSubscriptionId: { not: null } },
    select: {
      id: true,
      name: true,
      stripeSubscriptionId: true,
      stripeCustomerId: true,
      settings: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (!restaurant?.stripeSubscriptionId) {
    console.error('FAIL: No restaurant with stripeSubscriptionId in database')
    process.exit(1)
  }

  console.log('Restaurant:', restaurant.name, restaurant.id)
  console.log('Subscription:', restaurant.stripeSubscriptionId)

  const branchBilling = await getBranchBillingConfig()
  console.log('Branch price (platform):', `$${branchBilling.branchPriceUsd}/mo`)

  const before = await getBranchCapacityForRestaurant({
    stripeCustomerId: restaurant.stripeCustomerId,
    stripeSubscriptionId: restaurant.stripeSubscriptionId,
    settings: restaurant.settings,
    branchBilling,
  })
  console.log('Before — maxBranches:', before.maxBranches, 'extraBranchSlots:', before.extraBranchSlots)

  const branchCount = await prisma.branch.count({ where: { restaurantId: restaurant.id } })
  console.log('Branches in DB:', branchCount)

  if (branchCount >= before.maxBranches) {
    console.log('Adding 1 paid branch slot via Stripe API...')
    await incrementPaidBranchSlots(restaurant.stripeSubscriptionId, 1, branchBilling)
    console.log('OK: incrementPaidBranchSlots succeeded')
  } else {
    console.log('SKIP: unused branch slot already available')
  }

  const after = await getBranchCapacityForRestaurant({
    stripeCustomerId: restaurant.stripeCustomerId,
    stripeSubscriptionId: restaurant.stripeSubscriptionId,
    settings: restaurant.settings,
    branchBilling,
  })
  console.log('After — maxBranches:', after.maxBranches, 'extraBranchSlots:', after.extraBranchSlots)

  const sub = await retrieveSubscription(restaurant.stripeSubscriptionId)
  console.log('Stripe subscription items:')
  for (const item of sub.items.data) {
    const productId =
      typeof item.price.product === 'string' ? item.price.product : item.price.product?.id
    console.log(
      `  - ${item.id} qty=${item.quantity} metadata=${JSON.stringify(item.metadata)} product=${productId}`
    )
  }

  if (branchCount >= before.maxBranches && after.maxBranches <= before.maxBranches) {
    console.error('FAIL: maxBranches did not increase after purchase')
    process.exit(1)
  }

  console.log('\nPASS: branch billing Stripe integration works')
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : err)
  process.exit(1)
})
