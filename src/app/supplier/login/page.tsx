'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SupplierLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const result = await signIn('supplier-credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.error) {
        setError(result.error === 'CredentialsSignin' ? 'Invalid email or password' : result.error)
      } else {
        router.push('/supplier')
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
      <div className="flex items-center justify-center px-6 py-12 bg-gradient-to-br from-amber-50 to-orange-50 text-slate-900">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Supplier Portal
            </CardTitle>
            <CardDescription className="text-center">
              Sign in to manage your products and view restaurant usage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="supplier@example.com"
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
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
              <p className="text-center text-sm text-slate-500">
                Restaurant? <Link href="/login" className="text-amber-600 hover:underline">Sign in here</Link>
              </p>
              <div className="text-xs text-slate-500 mt-4 p-3 bg-slate-50 rounded-md">
                <p className="font-semibold mb-2">Demo accounts (password: password123):</p>
                <ul className="space-y-1">
                  <li>support@caff.iq</li>
                  <li>supplier1@demo.iq</li>
                  <li>supplier2@demo.iq</li>
                  <li>supplier3@demo.iq</li>
                </ul>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      <div className="relative hidden lg:block">
        <img
          src="https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=1400&q=80"
          alt="Supplier delivery"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12">
          <h2 className="text-3xl font-semibold">Connect with restaurants.</h2>
          <p className="mt-3 text-white/80">
            Manage your catalog, set prices, and see how restaurants use your products.
          </p>
        </div>
      </div>
    </div>
  )
}
