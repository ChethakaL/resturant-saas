import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import BillingClient from './BillingClient'
import { getBranchCapacityForRestaurant } from '@/lib/billing-branches'
import { getBranchBillingConfig } from '@/lib/branch-billing'
import { getPlatformConfig } from '@/lib/platform-config'
import { isSubscriptionAccessActive } from '@/lib/subscription-status'
import { getRestaurantPlanTier } from '@/lib/plan-features'

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

  const isActive = isSubscriptionAccessActive(restaurant?.subscriptionStatus)

  const platformCfg = await getPlatformConfig()
  const branchBilling = await getBranchBillingConfig()
  const priceMonthly = String(platformCfg.priceMonthly ?? process.env.STRIPE_PRICE_MONTHLY ?? '59')
  const priceAnnual = String(platformCfg.priceAnnual ?? process.env.STRIPE_PRICE_ANNUAL ?? '590')
  const settings = (restaurant?.settings as Record<string, unknown> | null) || {}
  const settingsBillingPeriod =
    settings.subscriptionBillingPeriod === 'annual' || settings.subscriptionBillingPeriod === 'monthly'
      ? settings.subscriptionBillingPeriod
      : null
  const currentPlan =
    restaurant?.subscriptionPriceId === priceAnnual
      ? 'annual'
      : restaurant?.subscriptionPriceId === priceMonthly
        ? 'monthly'
        : settingsBillingPeriod
  const currentProductPlanTier = getRestaurantPlanTier(restaurant)
  const pendingProductPlanTier =
    settings.pendingProductPlanTier === 'SMART_MENU_MANAGER' || settings.pendingProductPlanTier === 'SMART_RESTAURANT_MANAGER'
      ? settings.pendingProductPlanTier
      : null
  const pendingProductPlanTierEffectiveAt =
    typeof settings.pendingProductPlanTierEffectiveAt === 'string'
      ? settings.pendingProductPlanTierEffectiveAt
      : null

  let maxBranches = 0
  let extraBranchSlots = 0
  const stripeBillingEnabled = !!(platformCfg.stripeSecretKey || process.env.STRIPE_SECRET_KEY)

  if (stripeBillingEnabled && (restaurant?.stripeCustomerId || restaurant?.stripeSubscriptionId)) {
    try {
      const capacity = await getBranchCapacityForRestaurant({
        stripeCustomerId: restaurant?.stripeCustomerId,
        stripeSubscriptionId: restaurant?.stripeSubscriptionId,
        settings: restaurant?.settings,
        branchBilling,
      })
      maxBranches = capacity.maxBranches
      extraBranchSlots = capacity.extraBranchSlots
    } catch {
      const settings = (restaurant?.settings as Record<string, unknown>) || {}
      maxBranches = Math.max(0, (settings.maxBranches as number) || 0)
      extraBranchSlots = maxBranches
    }
  } else {
    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    maxBranches = Math.max(0, (settings.maxBranches as number) || 0)
    extraBranchSlots = maxBranches
  }

  return (
    <BillingClient
      isActive={!!isActive}
      currentPeriodEnd={restaurant?.currentPeriodEnd?.toISOString() ?? null}
      currentPlan={currentPlan}
      currentProductPlanTier={currentProductPlanTier}
      pendingProductPlanTier={pendingProductPlanTier}
      pendingProductPlanTierEffectiveAt={pendingProductPlanTierEffectiveAt}
      pricesConfigured={!!(priceMonthly && priceAnnual)}
      priceMonthly={priceMonthly}
      priceAnnual={priceAnnual}
      priceBranch={String(branchBilling.branchPriceUsd)}
      maxBranches={maxBranches}
      extraBranchSlots={extraBranchSlots}
      stripePriceBranchConfigured={stripeBillingEnabled}
    />
  )
}
