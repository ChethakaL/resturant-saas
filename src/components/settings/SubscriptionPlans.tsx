'use client'

import { Button } from '@/components/ui/button'
import { Loader2, Check, Sparkles, Zap, Crown } from 'lucide-react'

const FEATURES = [
  'Menu management & digital menu builder',
  'AI-powered menu optimization',
  'P&L analytics & sales reports',
  'POS & order management',
  'Table & inventory tracking',
  'HR, shifts & payroll',
  'Restaurant theme customization',
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

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Monthly plan */}
      <div
        className={`group relative flex flex-col rounded-2xl border-2 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-lg min-h-[340px] ${
          isActive && currentPlan === 'monthly'
            ? 'border-emerald-400 bg-emerald-50/30'
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
          <p className="mt-2 text-sm text-slate-600">Cancel anytime. No long-term commitment.</p>
        </div>
        <ul className="mb-6 flex-1 space-y-2 text-sm text-slate-600">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              {f}
            </li>
          ))}
        </ul>
        {isActive && currentPlan === 'monthly' ? (
          <Button disabled className="mt-auto w-full" variant="secondary">
            <Check className="mr-2 h-4 w-4" />
            Current plan
          </Button>
        ) : (
          <Button
            className="mt-auto w-full"
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
        className={`group relative flex flex-col rounded-2xl border-2 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-lg min-h-[340px] ${
          isActive && currentPlan === 'annual'
            ? 'border-emerald-400 bg-emerald-50/30'
            : 'border-emerald-300 bg-gradient-to-br from-emerald-50/50 to-teal-50/50'
        }`}
      >
        <div className="absolute -top-3 right-4 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow">
          Save $80
        </div>
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <Crown className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium text-emerald-700">Annual</span>
        </div>
        <div className="mb-5">
          <span className="text-3xl font-bold text-slate-900">$400</span>
          <span className="text-slate-500">/year</span>
          <p className="mt-2 text-sm text-slate-600">
            Best value. Save $80 compared to monthly billing.
          </p>
        </div>
        <ul className="mb-6 flex-1 space-y-2 text-sm text-slate-600">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              {f}
            </li>
          ))}
        </ul>
        {isActive && currentPlan === 'annual' ? (
          <Button disabled className="mt-auto w-full" variant="secondary">
            <Check className="mr-2 h-4 w-4" />
            Current plan
          </Button>
        ) : (
          <Button
            className="mt-auto w-full bg-emerald-600 hover:bg-emerald-700"
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
