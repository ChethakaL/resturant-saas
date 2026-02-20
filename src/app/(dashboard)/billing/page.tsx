import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import BillingClient from './BillingClient'

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

  return (
    <BillingClient
      isActive={!!isActive}
      currentPeriodEnd={restaurant?.currentPeriodEnd?.toISOString() ?? null}
      currentPlan={currentPlan}
      pricesConfigured={!!(priceMonthly && priceAnnual)}
    />
  )
}
