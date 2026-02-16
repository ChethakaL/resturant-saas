'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    if (searchParams.get('registered') === '1') setRegistered(true)
  }, [searchParams])

  const handleDemoLogin = async () => {
    setError('')
    setIsLoading(true)
    try {
      const result = await signIn('credentials', {
        email: 'owner@alrafidain.iq',
        password: 'password123',
        redirect: false,
      })

      if (result?.error) {
        setError('Demo login failed. Please try again.')
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (error) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (error) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-950 text-white">
      <div className="flex items-center justify-center px-6 py-12 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Restaurant SaaS
            </CardTitle>
            <CardDescription className="text-center">
              Sign in to your restaurant management system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="owner@alrafidain.iq"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              {registered && (
                <div className="text-sm text-emerald-600 bg-emerald-50 p-3 rounded-md">
                  Restaurant registered. You can sign in now.
                </div>
              )}
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
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleDemoLogin}
                disabled={isLoading}
              >
                Sign In as Demo Owner
              </Button>

              <p className="text-center text-sm text-slate-500 mt-4">
                New restaurant? <Link href="/register" className="text-amber-600 hover:underline">Register your restaurant</Link>
              </p>
              <p className="text-center text-sm text-slate-500">
                Supplier? <a href="/supplier/login" className="text-amber-600 hover:underline">Sign in to Supplier Portal</a>
              </p>
              <div className="text-xs text-slate-500 mt-4 p-3 bg-slate-50 rounded-md">
                <p className="font-semibold mb-1">Demo Accounts:</p>
                <p>owner@alrafidain.iq / password123</p>
                <p>manager@alrafidain.iq / password123</p>
                <p>staff@alrafidain.iq / password123</p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      <div className="relative hidden lg:block">
        <img
          src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80"
          alt="Restaurant interior"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12">
          <h2 className="text-3xl font-semibold">Crafted for restaurant teams.</h2>
          <p className="mt-3 text-white/80">
            Track inventory, manage your menu, and close cash orders with confidence.
          </p>
        </div>
      </div>
    </div>
  )
}
