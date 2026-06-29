'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Check, Crown, Clock, UtensilsCrossed } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { ProductPlanTier } from '@/lib/plan-features'

interface SubscriptionPlansProps {
  pricesConfigured: boolean
  isActive: boolean
  currentPlan: 'monthly' | 'annual' | null
  currentProductPlanTier?: ProductPlanTier
  pendingProductPlanTier?: ProductPlanTier | null
  pendingProductPlanTierEffectiveAt?: string | null
  loadingPlan: string | null
  onSubscribe: (plan: 'monthly' | 'annual', productPlanTier: ProductPlanTier) => void
  onScheduleDowngrade?: (productPlanTier: ProductPlanTier) => void
  onCancelScheduledDowngrade?: () => void
  priceMonthly: string
  priceAnnual: string
  discountPercentage?: number
}

export function SubscriptionPlans({
  pricesConfigured,
  isActive,
  currentPlan,
  currentProductPlanTier,
  pendingProductPlanTier,
  pendingProductPlanTierEffectiveAt,
  loadingPlan,
  onSubscribe,
  onScheduleDowngrade,
  onCancelScheduledDowngrade,
  priceMonthly = '59',
  priceAnnual = '590',
  discountPercentage = 0,
}: SubscriptionPlansProps) {
  const { t } = useI18n()
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>(currentPlan ?? 'monthly')
  const features = [t.sub_feature_menu, t.sub_feature_ai, t.sub_feature_analytics, t.sub_feature_tables, t.sub_feature_theme]
  const restaurantFeatures = [t.sub_feature_pos, 'Live P&L', t.sub_feature_hr]

  const calculateDiscounted = (price: string) => {
    const val = Number(price)
    if (isNaN(val) || discountPercentage <= 0) return null
    const discounted = val * (1 - discountPercentage / 100)
    return discounted.toFixed(2).replace(/\.00$/, '')
  }

  const monthlyDiscounted = calculateDiscounted(priceMonthly)
  const annualDiscounted = calculateDiscounted(priceAnnual)
  const menuPrice = billingPeriod === 'annual' ? priceAnnual : priceMonthly
  const menuDiscounted = billingPeriod === 'annual' ? annualDiscounted : monthlyDiscounted
  const restaurantPrice = billingPeriod === 'annual' ? '2000' : '200'
  const restaurantDiscounted = discountPercentage > 0 ? (billingPeriod === 'annual' ? '1660' : '166') : null
  const interval = billingPeriod === 'annual' ? t.sub_per_year : t.sub_per_month
  const planCards = [
    {
      key: 'menu',
      title: 'Smart Menu Manager',
      eyebrow: 'Essential menu tools',
      price: menuPrice,
      discounted: menuDiscounted,
      productPlanTier: 'SMART_MENU_MANAGER' as const,
      icon: UtensilsCrossed,
      features,
      excluded: restaurantFeatures,
      note: 'Menu, AI, analytics, tables and brand tools.',
    },
    {
      key: 'restaurant',
      title: 'Smart Restaurant Manager',
      eyebrow: 'Full operations suite',
      price: restaurantPrice,
      discounted: restaurantDiscounted,
      productPlanTier: 'SMART_RESTAURANT_MANAGER' as const,
      icon: Crown,
      features: [...features, ...restaurantFeatures],
      excluded: [],
      note: 'Everything unlocked, including POS, Waiter Portal, Live P&L and HR.',
      highlighted: true,
    },
  ]

  if (!pricesConfigured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
        {t.sub_billing_not_configured}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {billingPeriod === 'annual' ? 'Annual billing is selected.' : 'Monthly billing is selected.'}
        </p>
        <div className="inline-flex w-full rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-auto">
          {(['monthly', 'annual'] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setBillingPeriod(period)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors sm:flex-none ${
                billingPeriod === period
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              aria-pressed={billingPeriod === period}
            >
              {period === 'monthly' ? t.sub_monthly : t.sub_annual}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {planCards.map((card) => {
          const Icon = card.icon
          const loadingKey = `${card.productPlanTier}:${billingPeriod}`
          const isCurrent =
            isActive &&
            currentPlan === billingPeriod &&
            currentProductPlanTier === card.productPlanTier
          const isSubscribedToDifferentPlan = isActive && !isCurrent
          const canScheduleDowngrade =
            isActive &&
            currentProductPlanTier === 'SMART_RESTAURANT_MANAGER' &&
            card.productPlanTier === 'SMART_MENU_MANAGER' &&
            pendingProductPlanTier !== 'SMART_MENU_MANAGER'
          const isPendingDowngrade =
            pendingProductPlanTier === 'SMART_MENU_MANAGER' &&
            card.productPlanTier === 'SMART_MENU_MANAGER' &&
            !!pendingProductPlanTierEffectiveAt
          return (
            <div
              key={card.key}
              className={`relative flex flex-col rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
                card.highlighted ? 'border-slate-900' : 'border-slate-200'
              }`}
            >
              {card.highlighted && (
                <div className="absolute right-4 top-4 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                  Unlocked
                </div>
              )}
              <div className="mb-4 flex items-center gap-3 pr-20">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">{card.title}</h4>
                  <p className="text-sm text-slate-500">{card.eyebrow}</p>
                </div>
              </div>
              <div className="mb-4 flex flex-wrap items-baseline gap-1.5">
                {card.discounted ? (
                  <>
                    <span className="text-3xl font-bold text-slate-900">${card.discounted}</span>
                    <span className="text-lg font-medium text-slate-400 line-through">${card.price}</span>
                  </>
                ) : (
                  <span className="text-3xl font-bold text-slate-900">${card.price}</span>
                )}
                <span className="text-slate-500">{interval}</span>
              </div>
              <p className="mb-4 text-sm text-slate-500">{card.note}</p>
              <ul className="mb-4 flex-1 space-y-2 text-sm">
                {card.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-slate-700">
                    <Check className="h-4 w-4 shrink-0 text-slate-600" />
                    {feature}
                  </li>
                ))}
                {card.excluded.length > 0 && (
                  <li className="border-t border-slate-100 pt-2">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Not included</p>
                    <ul className="space-y-1.5">
                      {card.excluded.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-slate-400">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
              {isCurrent ? (
                <Button disabled className="mt-auto w-full" variant="secondary">
                  <Check className="mr-2 h-4 w-4" />
                  {t.sub_current_plan}
                </Button>
              ) : isPendingDowngrade ? (
                <Button
                  className="mt-auto w-full"
                  variant="outline"
                  disabled={!!loadingPlan}
                  onClick={onCancelScheduledDowngrade}
                >
                  {loadingPlan === 'cancel-downgrade' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Keep Smart Restaurant Manager
                </Button>
              ) : canScheduleDowngrade ? (
                <Button
                  className="mt-auto w-full"
                  variant="outline"
                  disabled={!!loadingPlan}
                  onClick={() => onScheduleDowngrade?.(card.productPlanTier)}
                >
                  {loadingPlan === 'downgrade:SMART_MENU_MANAGER' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Downgrade next billing period
                </Button>
              ) : isSubscribedToDifferentPlan ? (
                <Button disabled className="mt-auto w-full" variant="outline">
                  Manage subscription above
                </Button>
              ) : (
                <Button
                  className="mt-auto w-full bg-slate-900 text-white hover:bg-slate-800"
                  disabled={!!loadingPlan}
                  onClick={() => onSubscribe(billingPeriod, card.productPlanTier)}
                >
                  {loadingPlan === loadingKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t.sub_subscribe_now}
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
