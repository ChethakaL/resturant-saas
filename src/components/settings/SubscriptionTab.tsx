'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { SubscriptionPlans } from '@/components/settings/SubscriptionPlans'

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
  const { toast } = useToast()
  const [loadingPlan, setLoadingPlan] = useState<'monthly' | 'annual' | null>(null)
  const [managingSubscription, setManagingSubscription] = useState(false)

  useEffect(() => {
    const success = searchParams.get('success') === 'true'
    const canceled = searchParams.get('canceled') === 'true'
    if (success) {
      toast({ title: 'Thank you', description: 'Your subscription is now active.' })
    }
    if (canceled) {
      toast({ title: 'Canceled', description: 'Checkout was canceled.', variant: 'destructive' })
    }
  }, [searchParams, toast])

  const handleSubscribe = async (plan: 'monthly' | 'annual') => {
    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
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
                <h3 className="text-lg font-semibold text-slate-900">Active subscription</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {currentPlan === 'annual'
                    ? 'Annual plan · $400/year'
                    : currentPlan === 'monthly'
                      ? 'Monthly plan · $40/month'
                      : 'Your subscription is active'}
                  {periodEndLabel && (
                    <span className="block mt-0.5 text-xs text-slate-400">Renews on {periodEndLabel}</span>
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
              Manage subscription
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-400 border-t border-slate-100 pt-3">
            Update payment method, view invoices, or cancel — in your secure Stripe portal.
          </p>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Choose your plan</h3>
        <SubscriptionPlans
          pricesConfigured={pricesConfigured}
          isActive={isActive}
          currentPlan={currentPlan}
          loadingPlan={loadingPlan}
          onSubscribe={handleSubscribe}
        />
      </div>
    </div>
  )
}
