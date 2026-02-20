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
import { CreditCard } from 'lucide-react'
import { SubscriptionPlans } from '@/components/settings/SubscriptionPlans'
import { useToast } from '@/components/ui/use-toast'

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
  const [loadingPlan, setLoadingPlan] = useState<'monthly' | 'annual' | null>(null)

  const showPopup = !hasActiveSubscription && pathname !== '/settings'

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

  const goToSettings = () => {
    router.push('/settings?tab=subscription')
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
            <SubscriptionPlans
              pricesConfigured={subscription.pricesConfigured}
              isActive={false}
              currentPlan={subscription.currentPlan}
              loadingPlan={loadingPlan}
              onSubscribe={handleSubscribe}
            />
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200">
            <Button variant="ghost" size="sm" onClick={goToSettings} className="text-slate-600">
              Manage subscription in Settings →
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
