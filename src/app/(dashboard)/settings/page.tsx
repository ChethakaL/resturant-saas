import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    redirect('/login')
  }
  const [restaurant, user] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        id: true,
        name: true,
        logo: true,
        settings: true,
        subscriptionStatus: true,
        subscriptionPriceId: true,
        currentPeriodEnd: true,
      },
    }),

    prisma.user.findUnique({
      where: { id: session.user.id! },
      select: { defaultBackgroundPrompt: true },
    }),
  ])

  const settings = (restaurant?.settings as Record<string, unknown>) || {}
  const themeFromSettings = (settings.theme as Record<string, string>) || {}
  const currentTheme = {
    ...themeFromSettings,
    menuTimezone: (settings.menuTimezone as string) || 'Asia/Baghdad',
    themePreset: (settings.themePreset as string) ?? null,
    backgroundImageUrl: (settings.backgroundImageUrl as string) ?? '',
    managementLanguage: (settings.managementLanguage as string) || 'en',
  }

  const defaultBackgroundPrompt = user?.defaultBackgroundPrompt ?? ''

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

  const subscription = {
    isActive: !!isActive,
    currentPeriodEnd: restaurant?.currentPeriodEnd?.toISOString() ?? null,
    currentPlan,
    pricesConfigured: !!(priceMonthly && priceAnnual),
  }

  return (
    <SettingsClient
      currentTheme={currentTheme}
      defaultBackgroundPrompt={defaultBackgroundPrompt}
      subscription={subscription}
    />
  )
}
