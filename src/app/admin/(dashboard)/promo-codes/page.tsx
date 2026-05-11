'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Tag, Plus, Loader2, Trash2, Building2, Search, ExternalLink } from 'lucide-react'

type PromoCode = {
  id: string
  code: string
  type: 'ONE_YEAR_FREE' | 'ONE_MONTH_FREE' | 'PERCENTAGE'
  value: number | null
  stripeCouponId: string | null
  maxRedemptions: number | null
  timesRedeemed: number
  createdAt: string
  redemptions: {
    id: string
    createdAt: string
    restaurant: {
      id: string
      name: string
      slug: string
      email: string | null
      subscriptionStatus: string | null
      createdAt: string
    }
  }[]
}

export default function AdminPromoCodesPage() {
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [createLoading, setCreateLoading] = useState(false)
  const [code, setCode] = useState('')
  const [type, setType] = useState<'ONE_YEAR_FREE' | 'ONE_MONTH_FREE' | 'PERCENTAGE'>('ONE_YEAR_FREE')
  const [percentOff, setPercentOff] = useState('16.95')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string } | null>(null)
  const [redemptionTarget, setRedemptionTarget] = useState<PromoCode | null>(null)
  const [redemptionSearch, setRedemptionSearch] = useState('')
  const { toast } = useToast()

  const filteredRedemptions = useMemo(() => {
    if (!redemptionTarget) return []
    const query = redemptionSearch.trim().toLowerCase()
    if (!query) return redemptionTarget.redemptions

    return redemptionTarget.redemptions.filter((redemption) => {
      const restaurant = redemption.restaurant
      return [restaurant.name, restaurant.email, restaurant.slug, restaurant.subscriptionStatus]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    })
  }, [redemptionSearch, redemptionTarget])

  async function fetchPromos() {
    try {
      const res = await fetch('/api/admin/promo-codes')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setPromos(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load promo codes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPromos()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const trimmed = code.trim().toUpperCase()
    if (!trimmed || trimmed.length < 3) {
      setCreateError('Code must be at least 3 characters')
      return
    }
    setCreateLoading(true)
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: trimmed,
          type,
          percentOff: type === 'PERCENTAGE' ? parseFloat(percentOff) : undefined,
          maxRedemptions: maxRedemptions ? parseInt(maxRedemptions, 10) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error || 'Failed to create')
        return
      }
      setPromos((prev) => [{ ...data, redemptions: data.redemptions ?? [] }, ...prev])
      setCode('')
      setMaxRedemptions('')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create')
    } finally {
      setCreateLoading(false)
    }
  }

  function openDeleteDialog(promo: PromoCode) {
    setDeleteTarget({ id: promo.id, code: promo.code })
  }

  function closeDeleteDialog() {
    if (deletingId) return
    setDeleteTarget(null)
  }

  function openRedemptionDialog(promo: PromoCode) {
    setRedemptionTarget(promo)
    setRedemptionSearch('')
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      const res = await fetch(`/api/admin/promo-codes/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete')
      }
      setPromos((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast({ title: 'Promo code deleted', description: `${deleteTarget.code} is no longer usable at checkout.` })
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to delete',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Promo Codes</h1>
        <p className="text-slate-600 mt-1">
          Create promo codes for 1 year free or 1 month free. Share codes with restaurants to give them discounts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Promo Code
          </CardTitle>
          <CardDescription>New codes are created in Stripe and can be used at checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Code</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME2025"
                className="w-40 font-mono uppercase"
                maxLength={32}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'ONE_YEAR_FREE' | 'ONE_MONTH_FREE')}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white"
              >
                <option value="ONE_YEAR_FREE">1 Year Free</option>
                <option value="ONE_MONTH_FREE">1 Month Free</option>
                <option value="PERCENTAGE">Percentage Off</option>
              </select>
            </div>
            {type === 'PERCENTAGE' && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Percent Off</label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={percentOff}
                    onChange={(e) => setPercentOff(e.target.value)}
                    className="w-24 pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Max Redemptions (optional)</label>
              <Input
                type="number"
                min={1}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
                className="w-28"
              />
            </div>
            <Button type="submit" disabled={createLoading}>
              {createLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </>
              )}
            </Button>
          </form>
          {createError && <p className="text-sm text-red-600 mt-2">{createError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Existing Promo Codes
          </CardTitle>
          <CardDescription>
            {promos.length} promo code{promos.length !== 1 ? 's' : ''} created
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : error ? (
            <p className="text-red-600 text-sm">{error}</p>
          ) : promos.length === 0 ? (
            <p className="text-slate-500 text-sm">No promo codes yet. Create one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-4 font-medium">Code</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Redeemed</th>
                    <th className="py-2 pr-4 font-medium">Max</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 pr-4 font-medium">Restaurants</th>
                    <th className="py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-mono font-medium">{p.code}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={
                            p.type === 'ONE_YEAR_FREE'
                              ? 'text-emerald-600 font-medium'
                              : p.type === 'ONE_MONTH_FREE'
                                ? 'text-amber-600 font-medium'
                                : 'text-blue-600 font-medium'
                          }
                        >
                          {p.type === 'ONE_YEAR_FREE'
                            ? '1 Year Free'
                            : p.type === 'ONE_MONTH_FREE'
                              ? '1 Month Free'
                              : `${p.value}% Off`}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{p.timesRedeemed}</td>
                      <td className="py-3 pr-4">{p.maxRedemptions ?? '∞'}</td>
                      <td className="py-3 text-slate-500">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        {p.redemptions.length === 0 ? (
                          <span className="text-slate-400">No restaurants yet</span>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => openRedemptionDialog(p)}>
                            <Building2 className="h-4 w-4 mr-2" />
                            View {p.redemptions.length} restaurant{p.redemptions.length !== 1 ? 's' : ''}
                          </Button>
                        )}
                      </td>
                      <td className="py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0"
                          onClick={() => openDeleteDialog(p)}
                          disabled={deletingId !== null}
                          title="Delete promo code"
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete promo code</DialogTitle>
            <DialogDescription>
              Delete <span className="font-mono font-medium">{deleteTarget?.code}</span>? It will no longer be
              usable at checkout.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog} disabled={!!deletingId}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={!!deletingId}>
              {deletingId ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!redemptionTarget} onOpenChange={(open) => !open && setRedemptionTarget(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Restaurants using <span className="font-mono">{redemptionTarget?.code}</span>
            </DialogTitle>
            <DialogDescription>
              {redemptionTarget?.redemptions.length ?? 0} redemption
              {redemptionTarget?.redemptions.length === 1 ? '' : 's'}
              {redemptionTarget
                ? ` · ${
                    redemptionTarget.type === 'ONE_YEAR_FREE'
                      ? '1 Year Free'
                      : redemptionTarget.type === 'ONE_MONTH_FREE'
                        ? '1 Month Free'
                        : `${redemptionTarget.value}% Off`
                  }`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={redemptionSearch}
                onChange={(e) => setRedemptionSearch(e.target.value)}
                placeholder="Search by restaurant, email, slug, or status"
                className="pl-9"
              />
            </div>

            <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 px-3 font-medium">Restaurant</th>
                    <th className="py-2 px-3 font-medium">Email / Slug</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium">Used Date</th>
                    <th className="py-2 px-3 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRedemptions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 px-3 text-center text-slate-500">
                        No matching restaurants.
                      </td>
                    </tr>
                  ) : (
                    filteredRedemptions.map((redemption) => (
                      <tr key={redemption.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 px-3 font-medium text-slate-900">
                          {redemption.restaurant.name}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          <div>{redemption.restaurant.email || 'No email'}</div>
                          <div className="text-xs text-slate-400">{redemption.restaurant.slug}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                            {redemption.restaurant.subscriptionStatus || 'No status'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {new Date(redemption.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-3">
                          <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Link
                              href={`/admin/restaurants/${redemption.restaurant.id}`}
                              title="Open restaurant"
                              onClick={() => setRedemptionTarget(null)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
