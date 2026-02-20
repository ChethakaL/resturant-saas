'use client'

import { Button } from '@/components/ui/button'
import { Loader2, Check, Sparkles, Zap, Crown, Clock } from 'lucide-react'

const FEATURES = [
  'Menu management & digital menu builder',
  'AI-powered menu optimization',
  'P&L analytics & sales reports',
  'Table & inventory tracking',
  'Restaurant theme customization',
]

const COMING_SOON_FEATURES = [
  'POS & order management',
  'HR, shifts & payroll',
]

interface SubscriptionPlansProps {
  pricesConfigured: boolean
  isActive: boolean
  currentPlan: 'monthly' | 'annual' | null
  loadingPlan: 'monthly' | 'annual' | null
  onSubscribe: (plan: 'monthly' | 'annual') => void
}

export function SubscriptionPlans({
  pricesConfigured,
  isActive,
  currentPlan,
  loadingPlan,
  onSubscribe,
}: SubscriptionPlansProps) {
  if (!pricesConfigured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
        Billing is not fully configured. Set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL.
      </div>
    )
  }

  const featureList = (
    <ul className="mb-4 flex-1 space-y-2 text-sm">
      {FEATURES.map((f) => (
        <li key={f} className="flex items-center gap-2 text-slate-700">
          <Check className="h-4 w-4 shrink-0 text-slate-600" />
          {f}
        </li>
      ))}
      <li className="pt-2 border-t border-slate-100">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Coming soon</p>
        <ul className="space-y-1.5">
          {COMING_SOON_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-slate-400">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      </li>
    </ul>
  )

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Monthly plan */}
      <div
        className={`group relative flex flex-col rounded-2xl border-2 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md ${
          isActive && currentPlan === 'monthly'
            ? 'border-slate-800'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Zap className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium text-slate-500">Monthly</span>
        </div>
        <div className="mb-5">
          <span className="text-3xl font-bold text-slate-900">$40</span>
          <span className="text-slate-500">/month</span>
          <p className="mt-2 text-sm text-slate-500">Cancel anytime. No long-term commitment.</p>
        </div>
        {featureList}
        {isActive && currentPlan === 'monthly' ? (
          <Button disabled className="mt-auto w-full" variant="secondary">
            <Check className="mr-2 h-4 w-4" />
            Current plan
          </Button>
        ) : (
          <Button
            className="mt-auto w-full bg-slate-900 hover:bg-slate-800 text-white"
            disabled={!!loadingPlan}
            onClick={() => onSubscribe('monthly')}
          >
            {loadingPlan === 'monthly' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Subscribe now
          </Button>
        )}
      </div>

      {/* Annual plan */}
      <div
        className={`group relative flex flex-col rounded-2xl border-2 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md ${
          isActive && currentPlan === 'annual'
            ? 'border-slate-800'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="absolute -top-3 right-4 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-white shadow">
          Save $80
        </div>
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Crown className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium text-slate-600">Annual</span>
        </div>
        <div className="mb-5">
          <span className="text-3xl font-bold text-slate-900">$400</span>
          <span className="text-slate-500">/year</span>
          <p className="mt-2 text-sm text-slate-500">
            Best value. Save $80 compared to monthly billing.
          </p>
        </div>
        {featureList}
        {isActive && currentPlan === 'annual' ? (
          <Button disabled className="mt-auto w-full" variant="secondary">
            <Check className="mr-2 h-4 w-4" />
            Current plan
          </Button>
        ) : (
          <Button
            className="mt-auto w-full bg-slate-900 hover:bg-slate-800 text-white"
            disabled={!!loadingPlan}
            onClick={() => onSubscribe('annual')}
          >
            {loadingPlan === 'annual' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Subscribe now
          </Button>
        )}
      </div>
    </div>
  )
}
