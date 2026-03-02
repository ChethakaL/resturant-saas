'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CreditCard, Check, Loader2 } from 'lucide-react'
import { SubscriptionPlans } from '@/components/settings/SubscriptionPlans'
import { useToast } from '@/components/ui/use-toast'
import { useI18n } from '@/lib/i18n'

interface SubscriptionGateProps {
  hasActiveSubscription: boolean
  subscription?: {
    currentPlan: 'monthly' | 'annual' | null
    pricesConfigured: boolean
  }
  children: React.ReactNode
}

/** Shows a popup with subscription plans when subscription is required but inactive. */
export function SubscriptionGate({
  hasActiveSubscription,
  subscription = { currentPlan: null, pricesConfigured: false },
  children,
}: SubscriptionGateProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const { t } = useI18n()
  const [loadingPlan, setLoadingPlan] = useState<'monthly' | 'annual' | null>(null)
  const [promoCode, setPromoCode] = useState('')
  const [promoApplied, setPromoApplied] = useState(false)
  const [applyingPromo, setApplyingPromo] = useState(false)

  const showPopup = !hasActiveSubscription && pathname !== '/billing' && pathname !== '/dashboard/billing'

  const handleSubscribe = async (plan: 'monthly' | 'annual') => {
    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          ...(promoCode.trim() && { promotionCode: promoCode.trim() }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout')
      if (data.url) window.location.href = data.url
      else throw new Error('No checkout URL returned')
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setLoadingPlan(null)
    }
  }

  const goToBilling = () => {
    router.push('/billing')
  }

  const handleApplyPromo = async () => {
    const trimmed = promoCode.trim()
    if (!trimmed) {
      toast({ title: 'Enter a promo code', variant: 'destructive' })
      return
    }
    setApplyingPromo(true)
    setPromoApplied(false)
    try {
      const res = await fetch('/api/billing/apply-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promotionCode: trimmed }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setPromoApplied(true)
        toast({ title: 'Subscription activated!', description: data.message || 'Enjoy your free period.' })
        router.refresh()
      } else {
        toast({ title: data.error || 'Invalid promo code', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Could not apply promo', variant: 'destructive' })
    } finally {
      setApplyingPromo(false)
    }
  }

  const handlePromoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleApplyPromo()
    }
  }

  return (
    <>
      {children}
      <Dialog open={showPopup}>
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-2">
              <CreditCard className="h-6 w-6" />
            </div>
            <DialogTitle>Subscription required</DialogTitle>
            <DialogDescription>
              Your restaurant needs an active subscription to use the admin portal. Choose a plan
              below to get started.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t.sub_promo_label ?? 'Promo code'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase())
                    setPromoApplied(false)
                  }}
                  onKeyDown={handlePromoKeyDown}
                  placeholder={t.sub_promo_placeholder ?? 'Enter promo code'}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApplyPromo}
                  disabled={applyingPromo || !promoCode.trim()}
                  className="shrink-0"
                >
                  {applyingPromo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : promoApplied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    t.sub_promo_apply ?? 'Apply'
                  )}
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t.sub_promo_hint ?? 'Get 1 year or 1 month free with a valid promo code.'}
              </p>
            </div>
            <SubscriptionPlans
              pricesConfigured={subscription.pricesConfigured}
              isActive={false}
              currentPlan={subscription.currentPlan}
              loadingPlan={loadingPlan}
              onSubscribe={handleSubscribe}
            />
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200">
            <Button variant="ghost" size="sm" onClick={goToBilling} className="text-slate-600">
              Open membership settings →
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
