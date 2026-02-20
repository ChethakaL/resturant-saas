'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function WaiterLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleDemoLogin = async () => {
    setError('')
    setIsLoading(true)
    try {
      const result = await signIn('waiter-credentials', {
        email: 'waiter@alrafidain.iq',
        password: 'waiter123',
        redirect: false,
      })
      if (result?.error) {
        setError('Demo login failed. Please try again.')
      } else {
        router.push('/waiter/dashboard')
        router.refresh()
      }
    } catch {
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
      const result = await signIn('waiter-credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.error) {
        setError('Invalid email or password')
      } else {
        router.push('/waiter/dashboard')
        router.refresh()
      }
    } catch {
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
            <CardTitle className="text-2xl font-bold text-center">Waiter Portal</CardTitle>
            <CardDescription className="text-center">Sign in to manage tables and orders</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="waiter-email">Email</Label>
                <Input
                  id="waiter-email"
                  type="email"
                  placeholder="waiter@alrafidain.iq"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="waiter-password">Password</Label>
                <Input
                  id="waiter-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleDemoLogin} disabled={isLoading}>
                Sign In as Demo Waiter
              </Button>
              <p className="text-center text-sm text-slate-500 mt-4">
                Restaurant staff? <Link href="/login" className="text-amber-600 hover:underline">Sign in to Dashboard</Link>
              </p>
              <div className="text-xs text-slate-500 mt-4 p-3 bg-slate-50 rounded-md">
                <p className="font-semibold mb-1">Demo: waiter@alrafidain.iq / waiter123</p>
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
          <h2 className="text-3xl font-semibold">Waiter Portal</h2>
          <p className="mt-3 text-white/80">Manage tables and take orders with ease.</p>
        </div>
      </div>
    </div>
  )
}
