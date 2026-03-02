'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { SubscriptionPlans } from '@/components/settings/SubscriptionPlans'
import { useI18n } from '@/lib/i18n'

interface SubscriptionTabProps {
  isActive: boolean
  currentPeriodEnd: string | null
  currentPlan: 'monthly' | 'annual' | null
  pricesConfigured: boolean
}

export default function SubscriptionTab({
  isActive,
  currentPeriodEnd,
  currentPlan,
  pricesConfigured,
}: SubscriptionTabProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { t } = useI18n()
  const [loadingPlan, setLoadingPlan] = useState<'monthly' | 'annual' | null>(null)
  const [managingSubscription, setManagingSubscription] = useState(false)
  const [referralLink, setReferralLink] = useState<string | null>(null)
  const [promoCode, setPromoCode] = useState('')
  const [referralLoading, setReferralLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [promoApplied, setPromoApplied] = useState(false)
  const [applyingPromo, setApplyingPromo] = useState(false)

  useEffect(() => {
    const success = searchParams.get('success') === 'true'
    const canceled = searchParams.get('canceled') === 'true'
    if (success) {
      toast({ title: t.sub_thank_you, description: t.sub_now_active })
    }
    if (canceled) {
      toast({ title: t.sub_canceled, description: t.sub_checkout_canceled, variant: 'destructive' })
    }
  }, [searchParams, toast, t.sub_thank_you, t.sub_now_active, t.sub_canceled, t.sub_checkout_canceled])

  useEffect(() => {
    const fetchReferral = async () => {
      try {
        const res = await fetch('/api/billing/referral')
        if (res.ok) {
          const data = await res.json()
          setReferralLink(data.link ?? null)
        }
      } catch { /* ignore */ } finally {
        setReferralLoading(false)
      }
    }
    fetchReferral()
  }, [])

  const handleCopyReferral = async () => {
    if (!referralLink) return
    await navigator.clipboard.writeText(referralLink)
    setCopied(true)
    toast({ title: t.sub_referral_copied })
    setTimeout(() => setCopied(false), 2000)
  }

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

  const periodEndLabel = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

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

  const handleManageSubscription = async () => {
    setManagingSubscription(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to open portal')
      if (data.url) window.location.href = data.url
      else throw new Error('No portal URL returned')
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Could not open billing portal',
        variant: 'destructive',
      })
    } finally {
      setManagingSubscription(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Active subscription banner */}
      {isActive && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Check className="h-6 w-6" strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{t.sub_active_subscription}</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {currentPlan === 'annual'
                    ? t.sub_annual_plan
                    : currentPlan === 'monthly'
                      ? t.sub_monthly_plan
                      : t.sub_subscription_active}
                  {periodEndLabel && (
                    <span className="block mt-0.5 text-xs text-slate-400">{t.sub_renews_on.replace('{{date}}', periodEndLabel)}</span>
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              disabled={managingSubscription}
              onClick={handleManageSubscription}
            >
              {managingSubscription ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {t.sub_manage_subscription}
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-400 border-t border-slate-100 pt-3">
            {t.sub_portal_description}
          </p>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">{t.sub_choose_plan}</h3>
        {!isActive && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.sub_promo_label ?? 'Promo code'}</label>
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
            <p className="mt-1 text-xs text-slate-500">{t.sub_promo_hint ?? 'Get 1 year or 1 month free with a valid promo code.'}</p>
          </div>
        )}
        <SubscriptionPlans
          pricesConfigured={pricesConfigured}
          isActive={isActive}
          currentPlan={currentPlan}
          loadingPlan={loadingPlan}
          onSubscribe={handleSubscribe}
        />
      </div>

      {/* Referral section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800">{t.sub_referral_title}</h3>
        <p className="mt-1 text-sm text-slate-500">{t.sub_referral_description}</p>
        {referralLoading ? (
          <div className="mt-4 flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t.sub_referral_link}</span>
          </div>
        ) : referralLink ? (
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              readOnly
              value={referralLink}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            />
            <Button variant="outline" onClick={handleCopyReferral} className="shrink-0">
              {copied ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              {copied ? t.sub_referral_copied : t.sub_referral_copy}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
