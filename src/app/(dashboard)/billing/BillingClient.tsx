'use client'

import SubscriptionTab from '@/components/settings/SubscriptionTab'

interface BillingClientProps {
  isActive: boolean
  currentPeriodEnd: string | null
  currentPlan: 'monthly' | 'annual' | null
  pricesConfigured: boolean
}

export default function BillingClient({
  isActive,
  currentPeriodEnd,
  currentPlan,
  pricesConfigured,
}: BillingClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Membership</h1>
        <p className="text-slate-500 mt-1">Manage your membership and billing details.</p>
      </div>
      <SubscriptionTab
        isActive={isActive}
        currentPeriodEnd={currentPeriodEnd}
        currentPlan={currentPlan}
        pricesConfigured={pricesConfigured}
      />
    </div>
  )
}
