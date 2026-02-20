import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/Sidebar'
import { ManagementLanguageProvider } from '@/components/layout/ManagementLanguageProvider'
import { SubscriptionGate } from '@/components/SubscriptionGate'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
  let subscriptionData: { currentPlan: 'monthly' | 'annual' | null; pricesConfigured: boolean } = {
    currentPlan: null,
    pricesConfigured: false,
  }
  if (session.user.restaurantId) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: {
        subscriptionStatus: true,
        subscriptionPriceId: true,
      },
    })
    hasActiveSubscription =
      restaurant?.subscriptionStatus === 'active' || restaurant?.subscriptionStatus === 'trialing'
    const priceMonthly = process.env.STRIPE_PRICE_MONTHLY
    const priceAnnual = process.env.STRIPE_PRICE_ANNUAL
    subscriptionData = {
      currentPlan:
        restaurant?.subscriptionPriceId === priceAnnual
          ? 'annual'
          : restaurant?.subscriptionPriceId === priceMonthly
            ? 'monthly'
            : null,
      pricesConfigured: !!(priceMonthly && priceAnnual),
    }
  }

  return (
    <ManagementLanguageProvider>
      <SubscriptionGate
        hasActiveSubscription={!!hasActiveSubscription}
        subscription={subscriptionData}
      >
        <div className="flex h-screen overflow-hidden">
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
        </div>
      </SubscriptionGate>
    </ManagementLanguageProvider>
  )
}
