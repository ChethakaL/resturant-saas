import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isSubscriptionAccessActive } from '@/lib/subscription-status'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { ManagementLanguageProvider } from '@/components/layout/ManagementLanguageProvider'
import { SubscriptionGate } from '@/components/SubscriptionGate'
import RestaurantDNAGate from '@/components/settings/RestaurantDNAGate'
import SetupOnboardingGuide from '@/components/onboarding/SetupOnboardingGuide'
import { getServerTranslations } from '@/lib/i18n/server'
import { getPlatformConfig } from '@/lib/platform-config'
import { reconcileRestaurantMainSubscriptions } from '@/lib/billing-subscription-sync'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { locale } = await getServerTranslations()
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  if (session.user.type === 'supplier') {
    redirect('/supplier')
  }

  if (session.user.type === 'superadmin') {
    redirect('/admin')
  }

  if (session.user.type === 'customer') {
    redirect('/customer/me')
  }

  // Waiters use /waiter portal; they never hit this layout. Only restaurant users.
  let hasActiveSubscription = true
  let subscriptionData: { 
    currentPlan: 'monthly' | 'annual' | null; 
    pricesConfigured: boolean;
    priceMonthly?: string;
    priceAnnual?: string;
  } = {
    currentPlan: null,
    pricesConfigured: false,
  }
  let onboardingComplete = true
  let setupOnboardingSeen = true
  let restaurantName = ''
  let setupProgress = {
    restaurantName: '',
    hasRestaurantDna: false,
    menuItemsCount: 0,
    categoriesCount: 0,
    mediaAssetsCount: 0,
    ingredientsCount: 0,
    tablesCount: 0,
  }

  if (session.user.restaurantId) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        name: true,
        subscriptionStatus: true,
        subscriptionPriceId: true,
        stripeCustomerId: true,
        settings: true,
      },
    })
    if (!isSubscriptionAccessActive(restaurant?.subscriptionStatus) && restaurant?.stripeCustomerId) {
      try {
        const sync = await reconcileRestaurantMainSubscriptions({
          restaurantId: session.user.restaurantId,
          stripeCustomerId: restaurant.stripeCustomerId,
        })
        if (sync.synced) {
          restaurant.subscriptionStatus = sync.primaryStatus
          restaurant.subscriptionPriceId = restaurant.subscriptionPriceId
        }
      } catch (error) {
        console.error('[dashboard layout] Failed to reconcile subscription from Stripe:', error)
      }
    }
    hasActiveSubscription = isSubscriptionAccessActive(restaurant?.subscriptionStatus)
    const platformCfg = await getPlatformConfig()
    const priceMonthly = String(platformCfg.priceMonthly || process.env.STRIPE_PRICE_MONTHLY || '59')
    const priceAnnual = String(platformCfg.priceAnnual || process.env.STRIPE_PRICE_ANNUAL || '590')
    
    subscriptionData = {
      currentPlan:
        restaurant?.subscriptionPriceId === process.env.STRIPE_PRICE_ANNUAL
          ? 'annual'
          : restaurant?.subscriptionPriceId === process.env.STRIPE_PRICE_MONTHLY
            ? 'monthly'
            : null,
      pricesConfigured: !!(priceMonthly && priceAnnual),
      priceMonthly,
      priceAnnual,
    }
    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    onboardingComplete = !!settings.onboardingComplete
    setupOnboardingSeen = !!settings.setupOnboardingSeen
    restaurantName = restaurant?.name ?? ''
    const [
      menuItemsCount,
      categoriesCount,
      mediaAssetsCount,
      ingredientsCount,
      tablesCount,
    ] = await Promise.all([
      prisma.menuItem.count({ where: { restaurantId: session.user.restaurantId } }),
      prisma.category.count({ where: { restaurantId: session.user.restaurantId } }),
      prisma.mediaAsset.count({ where: { restaurantId: session.user.restaurantId } }),
      prisma.ingredient.count({ where: { restaurantId: session.user.restaurantId } }),
      prisma.table.count({ where: { restaurantId: session.user.restaurantId } }),
    ])
    setupProgress = {
      restaurantName,
      hasRestaurantDna: onboardingComplete || !!settings.primaryColor || !!settings.descriptionTone || !!settings.restaurantVibeImageKey,
      menuItemsCount,
      categoriesCount,
      mediaAssetsCount,
      ingredientsCount,
      tablesCount,
    }
  }

  return (
    <ManagementLanguageProvider initialLocale={locale}>
      <Suspense fallback={null}>
        <SubscriptionGate
          hasActiveSubscription={!!hasActiveSubscription}
          subscription={subscriptionData}
        >
        <DashboardShell userName={session.user.name} userRole={session.user.role}>
          {/* Restaurant DNA Onboarding (first login) */}
          <RestaurantDNAGate
            onboardingComplete={onboardingComplete}
            restaurantName={restaurantName}
            hasActiveSubscription={!!hasActiveSubscription}
          />
          <SetupOnboardingGuide
            autoOpen={!setupOnboardingSeen && onboardingComplete}
            progress={setupProgress}
            hasActiveSubscription={!!hasActiveSubscription}
          />
          {children}
        </DashboardShell>
        </SubscriptionGate>
      </Suspense>
    </ManagementLanguageProvider>
  )
}
