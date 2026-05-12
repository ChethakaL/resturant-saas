import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isSubscriptionAccessActive } from '@/lib/subscription-status'
import { Sidebar } from '@/components/layout/Sidebar'
import { ManagementLanguageProvider } from '@/components/layout/ManagementLanguageProvider'
import { SubscriptionGate } from '@/components/SubscriptionGate'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'
import RestaurantDNAGate from '@/components/settings/RestaurantDNAGate'
import { getServerTranslations } from '@/lib/i18n/server'
import { getPlatformConfig } from '@/lib/platform-config'

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
  let restaurantName = ''

  if (session.user.restaurantId) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        name: true,
        subscriptionStatus: true,
        subscriptionPriceId: true,
        settings: true,
      },
    })
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
    restaurantName = restaurant?.name ?? ''
  }

  return (
    <ManagementLanguageProvider initialLocale={locale}>
      <Suspense fallback={null}>
        <SubscriptionGate
          hasActiveSubscription={!!hasActiveSubscription}
          subscription={subscriptionData}
        >
        <div className="flex h-screen h-[100dvh] overflow-hidden">
          {/* Sidebar */}
          <Sidebar
            userName={session.user.name}
            userRole={session.user.role}
          />

          {/* Main Content - min-h-0 lets flex child shrink so scroll height = content only (no extra white space) */}
          <div className="flex-1 min-h-0 overflow-auto bg-slate-50">
            <div className="p-8">
              {children}
            </div>
          </div>

          {/* AI Chatbot Widget */}
          <ChatbotWidget />

          {/* Restaurant DNA Onboarding (first login) */}
          <RestaurantDNAGate
            onboardingComplete={onboardingComplete}
            restaurantName={restaurantName}
            hasActiveSubscription={!!hasActiveSubscription}
          />
        </div>
        </SubscriptionGate>
      </Suspense>
    </ManagementLanguageProvider>
  )
}
