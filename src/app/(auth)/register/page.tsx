'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return
      }
      router.push('/login?registered=1')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

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
                    https://restaurant.babalilm-ai.com/
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
                  />
                </div>
                <p className="text-[10px] text-slate-500 flex items-center gap-1.5 px-1">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Your customers will visit this URL to view your menu.
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
                {isLoading ? 'Creating account...' : 'Register restaurant'}
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
