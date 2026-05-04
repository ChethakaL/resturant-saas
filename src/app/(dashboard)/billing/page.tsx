import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import BillingClient from './BillingClient'
import { getBranchCapacityForRestaurant } from '@/lib/billing-branches'
import { getPlatformConfig } from '@/lib/platform-config'

const STRIPE_PRICE_BRANCH = process.env.STRIPE_PRICE_BRANCH

export default async function BillingPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    redirect('/login')
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: {
      subscriptionStatus: true,
      subscriptionPriceId: true,
      currentPeriodEnd: true,
      settings: true,
      stripeSubscriptionId: true,
      stripeCustomerId: true,
    },
  })

  const isActive =
    restaurant?.subscriptionStatus === 'active' || restaurant?.subscriptionStatus === 'trialing'

  const platformCfg = await getPlatformConfig()
  const priceMonthly = String(platformCfg.priceMonthly ?? process.env.STRIPE_PRICE_MONTHLY ?? '59')
  const priceAnnual = String(platformCfg.priceAnnual ?? process.env.STRIPE_PRICE_ANNUAL ?? '590')
  const currentPlan =
    restaurant?.subscriptionPriceId === priceAnnual
      ? 'annual'
      : restaurant?.subscriptionPriceId === priceMonthly
        ? 'monthly'
        : null

  let maxBranches = 1
  if (STRIPE_PRICE_BRANCH) {
    try {
      const capacity = await getBranchCapacityForRestaurant({
        branchPriceId: STRIPE_PRICE_BRANCH,
        stripeCustomerId: restaurant?.stripeCustomerId,
        stripeSubscriptionId: restaurant?.stripeSubscriptionId,
        settings: restaurant?.settings,
      })
      maxBranches = capacity.maxBranches
    } catch {
      const settings = (restaurant?.settings as Record<string, unknown>) || {}
      maxBranches = (settings.maxBranches as number) || 1
    }
  } else {
    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    maxBranches = (settings.maxBranches as number) || 1
  }

  return (
    <BillingClient
      isActive={!!isActive}
      currentPeriodEnd={restaurant?.currentPeriodEnd?.toISOString() ?? null}
      currentPlan={currentPlan}
      pricesConfigured={!!(priceMonthly && priceAnnual)}
      priceMonthly={priceMonthly}
      priceAnnual={priceAnnual}
      priceBranch={String(platformCfg.priceBranch ?? process.env.STRIPE_PRICE_BRANCH ?? '10')}
      maxBranches={maxBranches}
      stripePriceBranchConfigured={!!STRIPE_PRICE_BRANCH?.trim()}
    />
  )
}
