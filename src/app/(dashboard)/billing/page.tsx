import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { stripe } from '@/lib/stripe'
import BillingClient from './BillingClient'

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
    },
  })

  const isActive =
    restaurant?.subscriptionStatus === 'active' || restaurant?.subscriptionStatus === 'trialing'
  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY
  const priceAnnual = process.env.STRIPE_PRICE_ANNUAL
  const currentPlan =
    restaurant?.subscriptionPriceId === priceAnnual
      ? 'annual'
      : restaurant?.subscriptionPriceId === priceMonthly
        ? 'monthly'
        : null

  let maxBranches = 1
  if (restaurant?.stripeSubscriptionId && STRIPE_PRICE_BRANCH) {
    try {
      const subscription = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId)
      const branchItem = subscription.items.data.find((item) => item.price.id === STRIPE_PRICE_BRANCH)
      maxBranches = 1 + (branchItem ? (branchItem.quantity ?? 0) : 0)
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
      maxBranches={maxBranches}
      stripePriceBranchConfigured={!!STRIPE_PRICE_BRANCH?.trim()}
    />
  )
}
