'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Check } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

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
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [loadingPlan, setLoadingPlan] = useState<'monthly' | 'annual' | null>(null)

  useEffect(() => {
    const success = searchParams.get('success') === 'true'
    const canceled = searchParams.get('canceled') === 'true'
    if (success) {
      toast({ title: 'Thank you', description: 'Your membership is now active.' })
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

  const hasPrices = PRICE_MONTHLY_ID && PRICE_ANNUAL_ID

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Membership</h1>
        <p className="text-slate-500 mt-1">Manage your restaurant subscription.</p>
      </div>

      {isActive && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-800">
              <Check className="h-5 w-5" />
              Active subscription
            </CardTitle>
            <CardDescription>
              {currentPlan === 'annual'
                ? 'Annual plan ($400/year)'
                : currentPlan === 'monthly'
                  ? 'Monthly plan ($40/month)'
                  : 'Active subscription'}
              {periodEndLabel && (
                <span className="block mt-1">Renews on {periodEndLabel}</span>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!pricesConfigured && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-600">
              Billing is not fully configured. Ask your administrator to set STRIPE_PRICE_MONTHLY and
              STRIPE_PRICE_ANNUAL (and NEXT_PUBLIC_* for labels if needed).
            </p>
          </CardContent>
        </Card>
      )}

      {pricesConfigured && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Monthly</CardTitle>
              <CardDescription>$40/month. Cancel anytime.</CardDescription>
            </CardHeader>
            <CardContent>
              {isActive && currentPlan === 'monthly' ? (
                <Button disabled className="w-full">
                  Current plan
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={!!loadingPlan}
                  onClick={() => handleSubscribe('monthly')}
                >
                  {loadingPlan === 'monthly' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Subscribe — $40/month'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Annual</CardTitle>
              <CardDescription>$400/year. Save $80 compared to monthly.</CardDescription>
            </CardHeader>
            <CardContent>
              {isActive && currentPlan === 'annual' ? (
                <Button disabled className="w-full">
                  Current plan
                </Button>
              ) : (
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!!loadingPlan}
                  onClick={() => handleSubscribe('annual')}
                >
                  {loadingPlan === 'annual' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Subscribe — $400/year'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
