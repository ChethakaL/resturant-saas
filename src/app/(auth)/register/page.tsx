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
  const [restaurantEmail, setRestaurantEmail] = useState('')
  const [restaurantPhone, setRestaurantPhone] = useState('')
  const [restaurantAddress, setRestaurantAddress] = useState('')
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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
          restaurantEmail: restaurantEmail.trim() || undefined,
          restaurantPhone: restaurantPhone.trim() || undefined,
          restaurantAddress: restaurantAddress.trim() || undefined,
          userName: userName.trim(),
          userEmail: userEmail.trim(),
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
                  onChange={(e) => setRestaurantName(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Restaurant page link (optional)</Label>
                <Input
                  id="slug"
                  type="text"
                  placeholder="e.g. al-rafidain"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={isLoading}
                  className="lowercase"
                />
                <p className="text-xs text-slate-500">
                  This becomes your page address (for example: `/al-rafidain`). Leave blank and we&apos;ll create it from your restaurant name.
                </p>
              </div>
              {referralCode && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Referral code applied: <span className="font-mono font-semibold">{referralCode}</span>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="restaurantEmail">Restaurant email (optional)</Label>
                <Input
                  id="restaurantEmail"
                  type="email"
                  placeholder="contact@restaurant.com"
                  value={restaurantEmail}
                  onChange={(e) => setRestaurantEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="restaurantPhone">Restaurant phone (optional)</Label>
                <Input
                  id="restaurantPhone"
                  type="tel"
                  placeholder="+964 770 000 0000"
                  value={restaurantPhone}
                  onChange={(e) => setRestaurantPhone(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="restaurantAddress">Address (optional)</Label>
                <Input
                  id="restaurantAddress"
                  type="text"
                  placeholder="Baghdad, Iraq"
                  value={restaurantAddress}
                  onChange={(e) => setRestaurantAddress(e.target.value)}
                  disabled={isLoading}
                />
              </div>
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
