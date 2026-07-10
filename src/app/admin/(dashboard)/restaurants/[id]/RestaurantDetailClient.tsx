'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, User, CreditCard } from 'lucide-react'
import {
  PRODUCT_PLAN_LABELS,
  type ProductPlanTier,
} from '@/lib/plan-features'

interface RestaurantDetailClientProps {
  restaurant: {
    id: string
    name: string
    slug: string
    email: string | null
    phone: string | null
    address: string | null
    subscriptionStatus: string | null
    currentPeriodEnd: string | null
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    createdAt: string
    productPlanTier: ProductPlanTier
    pendingProductPlanTier: ProductPlanTier | null
    pendingProductPlanTierEffectiveAt: string | null
  }
  users: Array<{
    id: string
    email: string
    name: string
    role: string
    isActive: boolean
  }>
  counts: {
    menuItems: number
    sales: number
    menuEvents: number
    categories: number
  }
}

export default function RestaurantDetailClient({
  restaurant,
  users,
  counts,
}: RestaurantDetailClientProps) {
  const { toast } = useToast()
  const [subscriptionStatus, setSubscriptionStatus] = useState(restaurant.subscriptionStatus || 'none')
  const [productPlanTier, setProductPlanTier] = useState<ProductPlanTier>(restaurant.productPlanTier)
  const [extendDays, setExtendDays] = useState('30')
  const [saving, setSaving] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [showExtendDialog, setShowExtendDialog] = useState(false)

  const handleUpdateSubscription = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/restaurants/${restaurant.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionStatus: subscriptionStatus === 'none' ? null : subscriptionStatus,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      toast({ title: 'Subscription updated', description: 'Changes saved successfully.' })
      window.location.reload()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleExtendSubscription = async () => {
    const days = parseInt(extendDays, 10)
    if (!days || days < 1) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/restaurants/${restaurant.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extendDays: days }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      toast({ title: 'Subscription extended', description: `Extended by ${days} days.` })
      setShowExtendDialog(false)
      window.location.reload()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to extend',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdatePlanTier = async () => {
    setSavingPlan(true)
    try {
      const res = await fetch(`/api/admin/restaurants/${restaurant.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productPlanTier }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      toast({
        title: 'Plan updated',
        description: `${restaurant.name} is now on ${PRODUCT_PLAN_LABELS[productPlanTier]}.`,
      })
      window.location.reload()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update plan',
        variant: 'destructive',
      })
    } finally {
      setSavingPlan(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle>Restaurant Info</CardTitle>
          <CardDescription>Basic details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-slate-500">Slug:</span> {restaurant.slug}</p>
          {restaurant.email && <p><span className="text-slate-500">Email:</span> {restaurant.email}</p>}
          {restaurant.phone && <p><span className="text-slate-500">Phone:</span> {restaurant.phone}</p>}
          {restaurant.address && <p><span className="text-slate-500">Address:</span> {restaurant.address}</p>}
          <p><span className="text-slate-500">Created:</span> {new Date(restaurant.createdAt).toLocaleDateString()}</p>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Platform usage</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <p>Menu items: <strong>{counts.menuItems}</strong></p>
          <p>Categories: <strong>{counts.categories}</strong></p>
          <p>Orders: <strong>{counts.sales}</strong></p>
          <p>Menu events: <strong>{counts.menuEvents.toLocaleString()}</strong></p>
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription
          </CardTitle>
          <CardDescription>Manage subscription status, plan tier, and billing period</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Product plan</p>
              <p className="text-xs text-slate-500 mt-1">
                Controls feature access (POS, Waiter Portal, Live P&amp;L, HR). Does not change Stripe billing.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>Plan tier</Label>
                <Select
                  value={productPlanTier}
                  onValueChange={(value) => setProductPlanTier(value as ProductPlanTier)}
                >
                  <SelectTrigger className="w-[260px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SMART_MENU_MANAGER">
                      {PRODUCT_PLAN_LABELS.SMART_MENU_MANAGER}
                    </SelectItem>
                    <SelectItem value="SMART_RESTAURANT_MANAGER">
                      {PRODUCT_PLAN_LABELS.SMART_RESTAURANT_MANAGER}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleUpdatePlanTier} disabled={savingPlan || productPlanTier === restaurant.productPlanTier}>
                {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save plan
              </Button>
            </div>
            {restaurant.pendingProductPlanTier && restaurant.pendingProductPlanTierEffectiveAt && (
              <p className="text-xs text-amber-700">
                Scheduled change to {PRODUCT_PLAN_LABELS[restaurant.pendingProductPlanTier]} on{' '}
                {new Date(restaurant.pendingProductPlanTierEffectiveAt).toLocaleDateString()}.
                Saving a plan here will clear that schedule.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={subscriptionStatus || 'none'} onValueChange={setSubscriptionStatus}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trialing">Trialing</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                  <SelectItem value="past_due">Past due</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleUpdateSubscription} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save status
            </Button>
            <Button variant="outline" onClick={() => setShowExtendDialog(true)} disabled={saving}>
              Extend subscription
            </Button>
          </div>
          {restaurant.currentPeriodEnd && (
            <p className="text-sm text-slate-500">
              Current period ends: {new Date(restaurant.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Users */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Users ({users.length})
          </CardTitle>
          <CardDescription>Restaurant staff with dashboard access</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-slate-500 text-sm">No users yet.</p>
          ) : (
            <ul className="space-y-2">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div>
                    <p className="font-medium text-slate-900">{u.name}</p>
                    <p className="text-sm text-slate-500">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700">{u.role}</span>
                    {!u.isActive && <span className="text-xs text-amber-600">Inactive</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend subscription</DialogTitle>
            <DialogDescription>
              Add days to the current period end. Status will be set to active if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Number of days</Label>
            <Input
              type="number"
              min={1}
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExtendSubscription} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
