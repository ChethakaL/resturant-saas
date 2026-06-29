'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, CheckCircle2, Clock, CreditCard, Crown, Loader2, ShieldCheck, UtensilsCrossed } from 'lucide-react'
import type { ProductPlanTier } from '@/lib/plan-features'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [restaurantName, setRestaurantName] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [slug, setSlug] = useState('')
  const [isManualSlug, setIsManualSlug] = useState(false)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [restaurantWhatsappNumber, setRestaurantWhatsappNumber] = useState('')
  const [password, setPassword] = useState('')
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly')
  const [productPlanTier, setProductPlanTier] = useState<ProductPlanTier>('SMART_MENU_MANAGER')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoMessage, setPromoMessage] = useState('')
  const [promoError, setPromoError] = useState('')
  const [promoApplied, setPromoApplied] = useState(false)
  const [promoDiscountPercent, setPromoDiscountPercent] = useState(0)
  const [applyingPromo, setApplyingPromo] = useState(false)
  const [pricing, setPricing] = useState({
    priceMonthly: '59',
    priceAnnual: '590',
    currency: 'USD',
    trialDays: 3,
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const isSlugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setRestaurantName(val)
    if (!isManualSlug) {
      setSlug(generateSlug(val))
    }
  }

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsManualSlug(true)
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(val)
  }

  useEffect(() => {
    const ref = searchParams.get('ref')?.trim()
    if (ref) setReferralCode(ref)
  }, [searchParams])

  useEffect(() => {
    fetch('/api/public/pricing')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        setPricing({
          priceMonthly: data.priceMonthly || '59',
          priceAnnual: data.priceAnnual || '590',
          currency: data.currency || 'USD',
          trialDays: Number(data.trialDays || 3),
        })
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!isSlugValid) {
      setError('Restaurant page link can only use lowercase letters, numbers, and single hyphens. Spaces are not allowed.')
      return
    }
    setShowPaymentModal(true)
  }

  const handleConfirmPayment = async () => {
    setError('')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/register-restaurant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName: restaurantName.trim(),
          slug: slug.trim() || undefined,
          referralCode: referralCode || undefined,
          userName: userName.trim(),
          userEmail: userEmail.trim(),
          restaurantWhatsappNumber: restaurantWhatsappNumber.trim() || undefined,
          password,
          plan,
          productPlanTier,
          ...(promoApplied && promoCode.trim() && { promotionCode: promoCode.trim() }),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      router.push(data.billingError ? '/login?registered=1&payment=setup-needed' : '/login?registered=1')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApplyPromo = async () => {
    const trimmed = promoCode.trim()
    setPromoMessage('')
    setPromoError('')
    setPromoApplied(false)
    setPromoDiscountPercent(0)
    if (!trimmed) {
      setPromoError('Enter a promo code')
      return
    }

    setApplyingPromo(true)
    try {
      const res = await fetch(`/api/public/validate-promo?code=${encodeURIComponent(trimmed)}`)
      const data = await res.json()
      if (!res.ok || !data.valid) {
        setPromoError(data.error || 'Invalid promo code')
        return
      }
      setPromoApplied(true)
      setPromoCode(data.code || trimmed.toUpperCase())
      setPromoDiscountPercent(data.type === 'PERCENTAGE' ? Number(data.value || 0) : 100)
      setPromoMessage(data.message || 'Promo code applied.')
    } catch {
      setPromoError('Could not validate promo code')
    } finally {
      setApplyingPromo(false)
    }
  }

  const handlePromoKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void handleApplyPromo()
    }
  }

  const monthlyPrice = Number(pricing.priceMonthly)
  const annualPrice = Number(pricing.priceAnnual)
  const displayDiscount = promoApplied && promoDiscountPercent > 0
  const monthlyDiscounted = displayDiscount && Number.isFinite(monthlyPrice)
    ? Math.max(0, monthlyPrice * (1 - promoDiscountPercent / 100)).toFixed(2).replace(/\.00$/, '')
    : null
  const annualDiscounted = displayDiscount && Number.isFinite(annualPrice)
    ? Math.max(0, annualPrice * (1 - promoDiscountPercent / 100)).toFixed(2).replace(/\.00$/, '')
    : null
  const restaurantMonthlyDiscounted = displayDiscount ? Math.max(0, 200 * (1 - promoDiscountPercent / 100)).toFixed(2).replace(/\.00$/, '') : null
  const restaurantAnnualDiscounted = displayDiscount ? Math.max(0, 2000 * (1 - promoDiscountPercent / 100)).toFixed(2).replace(/\.00$/, '') : null
  const billingPeriodLabel = plan === 'annual' ? '/ year' : '/ month'
  const planFeatures = [
    'Menu management & digital menu builder',
    'AI-powered menu optimization',
    'P&L analytics & sales reports',
    'Table & inventory tracking',
    'Restaurant theme customization',
  ]
  const restaurantOnlyFeatures = ['POS & Waiter Portal', 'Live P&L', 'HR, shifts & payroll']
  const modalPlanCards = [
    {
      tier: 'SMART_MENU_MANAGER' as const,
      title: 'Smart Menu Manager',
      eyebrow: 'Essential menu tools',
      icon: UtensilsCrossed,
      price: plan === 'annual' ? pricing.priceAnnual : pricing.priceMonthly,
      discounted: plan === 'annual' ? annualDiscounted : monthlyDiscounted,
      features: planFeatures,
      excluded: restaurantOnlyFeatures,
      note: 'Menu, AI, analytics, tables and brand tools.',
    },
    {
      tier: 'SMART_RESTAURANT_MANAGER' as const,
      title: 'Smart Restaurant Manager',
      eyebrow: 'Full operations suite',
      icon: Crown,
      price: plan === 'annual' ? '2000' : '200',
      discounted: plan === 'annual' ? restaurantAnnualDiscounted : restaurantMonthlyDiscounted,
      features: [...planFeatures, ...restaurantOnlyFeatures],
      excluded: [],
      note: 'Everything unlocked, including POS, Waiter Portal, Live P&L and HR.',
      highlighted: true,
    },
  ]

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-950 text-white">
      <div className="flex items-center justify-center px-6 py-12 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900 overflow-auto">
        <Card className="w-full max-w-md my-8">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Register your restaurant
            </CardTitle>
            <CardDescription className="text-center">
              Create your restaurant and owner account. No approval needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="restaurantName">Restaurant name *</Label>
                <Input
                  id="restaurantName"
                  type="text"
                  placeholder="e.g. Al-Rafidain Restaurant"
                  value={restaurantName}
                  onChange={handleNameChange}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Restaurant page link</Label>
                <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden transition-all focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-600 group">
                  <span className="bg-slate-50 px-3 py-2.5 text-[11px] font-medium text-slate-400 border-r border-slate-200 whitespace-nowrap hidden sm:block group-focus-within:text-amber-700/60 transition-colors">
                    https://restaurant.iserveplus.com/
                  </span>
                  <span className="bg-slate-50 px-2 py-2.5 text-[11px] font-medium text-slate-400 border-r border-slate-200 whitespace-nowrap sm:hidden">
                    .../
                  </span>
                  <Input
                    id="slug"
                    type="text"
                    value={slug}
                    onChange={handleSlugChange}
                    disabled={isLoading}
                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none h-11 lowercase font-medium text-slate-700"
                    placeholder="restaurant-name"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  />
                </div>
                <p className="text-[10px] text-slate-500 flex items-center gap-1.5 px-1">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Use lowercase letters, numbers, and hyphens only. Spaces are not allowed.
                </p>
              </div>
              {referralCode && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Referral code applied: <span className="font-mono font-semibold">{referralCode}</span>
                </div>
              )}
              <hr className="border-slate-200" />
              <p className="text-sm font-medium text-slate-700">Owner account</p>
              <div className="space-y-2">
                <Label htmlFor="userName">Your name *</Label>
                <Input
                  id="userName"
                  type="text"
                  placeholder="Your full name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userEmail">Your email *</Label>
                <Input
                  id="userEmail"
                  type="email"
                  placeholder="you@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
                <p className="text-[11px] text-slate-500">
                  Restaurant contact phone, WhatsApp, city, and street can be completed later in Restaurant DNA.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="restaurantWhatsappNumber">Restaurant WhatsApp</Label>
                <Input
                  id="restaurantWhatsappNumber"
                  type="tel"
                  placeholder="+964 770 000 0000"
                  value={restaurantWhatsappNumber}
                  onChange={(e) => setRestaurantWhatsappNumber(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-[11px] text-slate-500">
                  Optional. You can verify it later in Restaurant DNA.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={isLoading}
                />
              </div>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Creating account...' : 'Create account'}
              </Button>

              <p className="text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link href="/login" className="text-amber-600 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
        <Dialog open={showPaymentModal} onOpenChange={(open) => !isLoading && setShowPaymentModal(open)}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <CreditCard className="h-5 w-5" />
              </div>
              <DialogTitle className="text-2xl text-slate-950">Subscription required</DialogTitle>
              <DialogDescription className="text-slate-600">
                Start with {pricing.trialDays} days free. Choose a plan to activate the restaurant account and continue to secure payment.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No charge today during the free trial. Billing starts after {pricing.trialDays} days unless the subscription is cancelled.
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="signup-promo-code">Promo code</Label>
              <div className="flex gap-2">
                <Input
                  id="signup-promo-code"
                  value={promoCode}
                  onChange={(event) => {
                    setPromoCode(event.target.value.toUpperCase())
                    setPromoApplied(false)
                    setPromoDiscountPercent(0)
                    setPromoMessage('')
                    setPromoError('')
                  }}
                  onKeyDown={handlePromoKeyDown}
                  placeholder="Enter promo code"
                  disabled={isLoading || applyingPromo}
                  className="uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApplyPromo}
                  disabled={isLoading || applyingPromo}
                  className="min-w-24"
                >
                  {applyingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                </Button>
              </div>
              {promoMessage ? (
                <p className="text-sm font-medium text-emerald-700">{promoMessage}</p>
              ) : (
                <p className="text-xs text-slate-500">Discounts are applied on the secure Stripe payment page.</p>
              )}
              {promoError ? <p className="text-sm font-medium text-red-600">{promoError}</p> : null}
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  {plan === 'annual' ? 'Annual billing is selected.' : 'Monthly billing is selected.'}
                </p>
                <div className="inline-flex w-full rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-auto">
                  {(['monthly', 'annual'] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      disabled={isLoading}
                      onClick={() => setPlan(period)}
                      className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors sm:flex-none ${
                        plan === period ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                      aria-pressed={plan === period}
                    >
                      {period === 'monthly' ? 'Monthly' : 'Annual'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {modalPlanCards.map((card) => {
                  const Icon = card.icon
                  const selected = productPlanTier === card.tier
                  return (
                    <button
                      key={card.tier}
                      type="button"
                      disabled={isLoading}
                      onClick={() => setProductPlanTier(card.tier)}
                      className={`relative flex flex-col rounded-2xl border-2 p-5 text-left transition ${
                        selected
                          ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {card.highlighted ? (
                        <div className="absolute right-4 top-4 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow">
                          Unlocked
                        </div>
                      ) : null}
                      <div className="mb-4 flex items-start justify-between gap-3 pr-20">
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-950">{card.title}</p>
                            <p className="text-sm text-slate-500">{card.eyebrow}</p>
                          </div>
                        </div>
                        {selected ? <CheckCircle2 className="h-5 w-5 shrink-0 text-amber-600" /> : null}
                      </div>
                      <div className="mt-4 flex flex-wrap items-end gap-2 text-slate-950">
                        {card.discounted ? (
                          <>
                            <span className="text-3xl font-bold">{pricing.currency} {card.discounted}</span>
                            <span className="pb-1 text-lg font-semibold text-slate-400 line-through">{pricing.currency} {card.price}</span>
                          </>
                        ) : (
                          <span className="text-3xl font-bold">{pricing.currency} {card.price}</span>
                        )}
                        <span className="pb-1 text-sm text-slate-500">{billingPeriodLabel}</span>
                      </div>
                      <p className="mt-3 text-sm text-slate-500">{card.note}</p>
                      <ul className="mt-5 space-y-2 text-sm text-slate-700">
                        {card.features.map((feature) => (
                          <li key={feature} className="flex gap-2">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      {card.excluded.length > 0 ? (
                        <div className="mt-4 border-t border-slate-200 pt-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Not included</p>
                          <ul className="space-y-1.5 text-sm text-slate-400">
                            {card.excluded.map((feature) => (
                              <li key={feature} className="flex gap-2">
                                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                <p>
                  Secure Stripe checkout. Your account is created after you continue, then Stripe handles payment details.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setShowPaymentModal(false)} disabled={isLoading}>
                Back
              </Button>
              <Button type="button" onClick={handleConfirmPayment} disabled={isLoading} className="gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isLoading ? 'Creating account...' : `Continue to payment`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="relative hidden lg:block">
        <img
          src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80"
          alt="Restaurant"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12">
          <h2 className="text-3xl font-semibold">Get started in minutes.</h2>
          <p className="mt-3 text-white/80">
            No approval process. Register your restaurant and start managing your menu and orders.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function RegisterRestaurantPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center bg-slate-950"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-white" /></div>}>
      <RegisterForm />
    </Suspense>
  )
}
