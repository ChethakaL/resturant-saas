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
  if (session.user.role === 'STAFF') {
    redirect('/dashboard')
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
  const currentPeriodEnd = restaurant?.currentPeriodEnd ?? null
  const priceId = restaurant?.subscriptionPriceId ?? null
  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY
  const priceAnnual = process.env.STRIPE_PRICE_ANNUAL
  const currentPlan =
    priceId === priceAnnual ? 'annual' : priceId === priceMonthly ? 'monthly' : null

  return (
    <BillingClient
      isActive={!!isActive}
      currentPeriodEnd={currentPeriodEnd?.toISOString() ?? null}
      currentPlan={currentPlan}
      pricesConfigured={!!(priceMonthly && priceAnnual)}
    />
  )
}
