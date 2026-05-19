'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import SubscriptionTab from '@/components/settings/SubscriptionTab'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2, Plus, Trash2, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import AddBranchModal, { AddBranchFormData } from '@/components/branches/AddBranchModal'
import { useI18n } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface BillingClientProps {
  isActive: boolean
  currentPeriodEnd: string | null
  currentPlan: 'monthly' | 'annual' | null
  pricesConfigured: boolean
  priceMonthly: string
  priceAnnual: string
  priceBranch: string
  maxBranches: number
  extraBranchSlots: number
  stripePriceBranchConfigured?: boolean
}

interface Branch {
  id: string
  name: string
  address?: string | null
  phone?: string | null
  isActive: boolean
  _count?: { tables: number; sales: number }
}

export default function BillingClient({
  isActive,
  currentPeriodEnd,
  currentPlan,
  pricesConfigured,
  priceMonthly,
  priceAnnual,
  priceBranch,
  maxBranches,
  extraBranchSlots,
  stripePriceBranchConfigured = false,
}: BillingClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [showAddBranch, setShowAddBranch] = useState(false)
  const [addingBranch, setAddingBranch] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentDialogMode, setPaymentDialogMode] = useState<'subscribe' | 'upgrade'>('subscribe')
  const [branchSlotConfirmOpen, setBranchSlotConfirmOpen] = useState(false)
  const [deleteBranchTarget, setDeleteBranchTarget] = useState<{ id: string; name: string } | null>(null)
  const [releaseSlotModalOpen, setReleaseSlotModalOpen] = useState(false)
  const [deletingBranch, setDeletingBranch] = useState(false)
  const [openAddBranchAfterSlotPurchase, setOpenAddBranchAfterSlotPurchase] = useState(false)
  const [redirectingToStripe, setRedirectingToStripe] = useState<'monthly' | 'annual' | 'branch' | null>(null)
  const upgradeCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchBranches()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('branchUpgradeSuccess') === 'true') {
      toast({
        title: 'Branch payment approved',
        description: 'You can now add the new branch.',
      })
      setPaymentDialogOpen(false)
      router.replace('/billing')
      return
    }

    if (params.get('branchUpgradeCanceled') === 'true') {
      toast({
        title: 'Branch payment canceled',
        description: 'No extra branch charge was added.',
      })
      setPaymentDialogOpen(false)
      router.replace('/billing')
    }
  }, [router, toast])

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches')
      if (res.ok) {
        const data = await res.json()
        setBranches(data)
      }
    } catch { } finally {
      setLoadingBranches(false)
    }
  }

  const openPaymentDialog = (mode: 'subscribe' | 'upgrade', options?: { openAddBranchAfter?: boolean }) => {
    setPaymentDialogMode(mode)
    setOpenAddBranchAfterSlotPurchase(Boolean(options?.openAddBranchAfter))
    setPaymentDialogOpen(true)
  }

  const openBranchSlotConfirm = (openAddBranchAfter = true) => {
    setOpenAddBranchAfterSlotPurchase(openAddBranchAfter)
    setBranchSlotConfirmOpen(true)
  }

  const redirectToSubscriptionCheckout = async (plan: 'monthly' | 'annual') => {
    setRedirectingToStripe(plan)
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          returnPath: '/billing',
        }),
      })
      const data = await res.json()
      if (res.status === 409 && data.code === 'ALREADY_SUBSCRIBED') {
        const payload = data as { message?: string }
        toast({
          title: 'Already subscribed',
          description:
            typeof payload.message === 'string'
              ? payload.message
              : 'Your restaurant already has an active plan. Refreshing…',
        })
        router.refresh()
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout')
      if (data.url) {
        window.location.href = data.url
        return
      }
      throw new Error('No checkout URL returned')
    } catch (error) {
      toast({
        title: 'Stripe checkout failed',
        description: error instanceof Error ? error.message : 'Could not open Stripe checkout.',
        variant: 'destructive',
      })
      setRedirectingToStripe(null)
    }
  }

  const purchaseBranchSlot = async (options?: { openAddBranchAfter?: boolean }) => {
    setRedirectingToStripe('branch')
    try {
      const res = await fetch('/api/billing/purchase-branch-slot', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add branch slot')

      toast({
        title: 'Branch slot added',
        description:
          typeof data.message === 'string'
            ? data.message
            : `+$${priceBranch}/month added to your subscription. You can create the branch now.`,
      })
      setPaymentDialogOpen(false)
      setBranchSlotConfirmOpen(false)
      fetchBranches()
      router.refresh()
      if (options?.openAddBranchAfter) {
        setShowAddBranch(true)
      }
    } catch (error) {
      toast({
        title: 'Could not add branch slot',
        description: error instanceof Error ? error.message : 'Please try again or contact support.',
        variant: 'destructive',
      })
    } finally {
      setRedirectingToStripe(null)
    }
  }

  const handleAddBranch = async (formData: AddBranchFormData) => {
    setAddingBranch(true)
    try {
      const endpoint = stripePriceBranchConfigured && isActive ? '/api/billing/add-branch' : '/api/branches'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          address: formData.address ?? null,
          phone: formData.phone ?? null,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        const errorText = typeof data.error === 'string' ? data.error.toLowerCase() : ''
        const isLimitReached = res.status === 403 && errorText.includes('branch limit')
        const needsSubscription = res.status === 403 && errorText.includes('subscription')
        if (isLimitReached) {
          setShowAddBranch(false)
          openPaymentDialog(stripePriceBranchConfigured && isActive ? 'upgrade' : 'subscribe', {
            openAddBranchAfter: true,
          })
          setTimeout(() => upgradeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
          fetchBranches()
          router.refresh()
          return
        }
        if (needsSubscription) {
          setShowAddBranch(false)
          openPaymentDialog(isActive ? 'upgrade' : 'subscribe')
          return
        }
        throw new Error(data.error)
      }

      toast({
        title: 'Branch added',
        description: `"${data.name}" has been created.`,
      })
      setShowAddBranch(false)
      fetchBranches()
      router.refresh()
    } catch (err) {
      if (err instanceof Error && err.message) return
      toast({ title: 'Error', description: 'Failed to add branch', variant: 'destructive' })
    } finally {
      setAddingBranch(false)
    }
  }

  const confirmDeleteBranch = async () => {
    if (!deleteBranchTarget) return
    const { id, name } = deleteBranchTarget
    setDeletingBranch(true)
    try {
      const res = await fetch(`/api/branches/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: 'Cannot remove branch',
          description: (data as { error?: string }).error || 'Failed to remove branch',
          variant: 'destructive',
        })
        return
      }
      setDeleteBranchTarget(null)
      toast({
        title: 'Branch removed',
        description: `"${name}" removed. Your paid slot is still available to add another branch.`,
      })
      fetchBranches()
      router.refresh()
    } catch {
      toast({ title: 'Error', description: 'Failed to remove branch', variant: 'destructive' })
    } finally {
      setDeletingBranch(false)
    }
  }

  const confirmReleaseUnusedBranchSlot = async () => {
    setRedirectingToStripe('branch')
    try {
      const res = await fetch('/api/billing/release-branch-slot', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to release slot')
      setReleaseSlotModalOpen(false)
      toast({
        title: 'Branch slot released',
        description:
          typeof data.message === 'string'
            ? data.message
            : `You are no longer charged $${priceBranch}/month for that slot.`,
      })
      fetchBranches()
      router.refresh()
    } catch (error) {
      toast({
        title: 'Could not release slot',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setRedirectingToStripe(null)
    }
  }

  const unusedBranchSlots = Math.max(0, maxBranches - branches.length)

  const additionalBranchCost = Number(priceBranch) || 10
  const paidBranchSlots = extraBranchSlots

  const { t } = useI18n()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t.billing_title}</h1>
        <p className="text-slate-500 mt-1">{t.billing_subtitle}</p>
      </div>
      <SubscriptionTab
        isActive={isActive}
        currentPeriodEnd={currentPeriodEnd}
        currentPlan={currentPlan}
        pricesConfigured={pricesConfigured}
        priceMonthly={priceMonthly}
        priceAnnual={priceAnnual}
        extraBranchSlots={extraBranchSlots}
        priceBranch={priceBranch}
      />

      {/* Branch Management Section */}
      <div className="pt-6 border-t border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              {t.billing_branches}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {t.billing_plan_branches_paid.replace('{{price}}', String(additionalBranchCost))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">
              {t.billing_using_branches.replace('{{used}}', String(branches.length)).replace('{{total}}', String(maxBranches))}
            </p>
            {paidBranchSlots > 0 && (
              <p className="text-xs text-blue-600">
                {t.billing_paid_branch_slots.replace('{{price}}', String(paidBranchSlots * additionalBranchCost)).replace('{{count}}', String(paidBranchSlots))}
              </p>
            )}
          </div>
        </div>

        {/* Branch List */}
        {loadingBranches ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : branches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-slate-500">
              <Building2 className="h-10 w-10 mb-3 text-slate-300" />
              <p className="text-base font-medium">{t.billing_no_branches}</p>
              <p className="text-sm mt-1 text-center max-w-md">
                {!isActive
                  ? t.billing_add_first_branch_desc
                  : maxBranches > 0
                    ? t.billing_add_first_branch_desc
                    : t.billing_no_branches_paid_desc.replace('{{price}}', String(additionalBranchCost))}
              </p>
              {!isActive ? (
                <Button className="mt-4" onClick={() => openPaymentDialog('subscribe')}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t.billing_add_first_branch}
                </Button>
              ) : maxBranches > 0 ? (
                <Button className="mt-4" onClick={() => setShowAddBranch(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t.billing_add_branch}
                </Button>
              ) : (
                <Button className="mt-4" onClick={() => openBranchSlotConfirm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t.billing_buy_first_branch_slot.replace('{{price}}', String(additionalBranchCost))}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {branches.map((branch) => (
              <Card key={branch.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{branch.name}</p>
                      {branch.address && (
                        <p className="text-xs text-slate-500">{branch.address}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-xs text-slate-500">
                      <p>{branch._count?.tables ?? 0} {t.billing_tables_count}</p>
                      <p>{branch._count?.sales ?? 0} {t.billing_orders_count}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteBranchTarget({ id: branch.id, name: branch.name })}
                      title={branches.length > 1 ? t.billing_remove_branch : t.billing_delete_branch}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Branch modal */}
        <AddBranchModal
          open={showAddBranch}
          onOpenChange={setShowAddBranch}
          onSubmit={handleAddBranch}
          loading={addingBranch}
        />
        {branches.length > 0 && branches.length < maxBranches && !showAddBranch && (
          <Button variant="outline" className="mt-4" onClick={() => (isActive ? setShowAddBranch(true) : openPaymentDialog('subscribe'))}>
            <Plus className="h-4 w-4 mr-2" />
            {t.billing_add_branch}
          </Button>
        )}

        {isActive && maxBranches > branches.length && !showAddBranch && (
          <Card className="mt-4 border-amber-200 bg-amber-50/50">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-800">Unused paid branch slot</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  You have {maxBranches - branches.length} paid slot(s) not tied to a branch. Add a branch
                  without paying again, or release the slot to stop ${priceBranch}/mo.
                </p>
              </div>
              <Button
                variant="outline"
                className="shrink-0 border-amber-300"
                onClick={() => setReleaseSlotModalOpen(true)}
                disabled={redirectingToStripe !== null}
              >
                {redirectingToStripe === 'branch' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Release unused slot
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Request More Branches CTA — at limit: show Upgrade or Contact us; otherwise Add Branch */}
        {branches.length >= maxBranches && maxBranches > 0 && !showAddBranch && (
          <Card ref={upgradeCardRef} id="upgrade-for-branch" className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 ring-2 ring-blue-200">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-800">{t.billing_need_more_branches}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {(stripePriceBranchConfigured && isActive
                    ? t.billing_extra_branch_cost_desc_invoice
                    : t.billing_extra_branch_cost_desc
                  ).replace('{{price}}', String(additionalBranchCost))}
                </p>
              </div>
              <Button
                onClick={() => openBranchSlotConfirm(true)}
                disabled={redirectingToStripe !== null}
                className="shrink-0"
                size="lg"
              >
                {redirectingToStripe === 'branch' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Add branch slot — ${priceBranch}/mo
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {paymentDialogMode === 'subscribe' ? 'Payment required to add a branch' : `Add another branch for $${priceBranch}/month`}
            </DialogTitle>
            <DialogDescription>
              {paymentDialogMode === 'subscribe'
                ? 'Branches are a paid feature. Choose a plan below and continue to Stripe checkout before adding your branch.'
                : `Your card on file will be charged now (prorated for this billing period, then $${additionalBranchCost}/month for each extra branch). Do you want to continue?`}
            </DialogDescription>
          </DialogHeader>

          {paymentDialogMode === 'subscribe' ? (
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                type="button"
                onClick={() => void redirectToSubscriptionCheckout('monthly')}
                disabled={redirectingToStripe !== null}
              >
                {redirectingToStripe === 'monthly' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue with monthly plan
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void redirectToSubscriptionCheckout('annual')}
                disabled={redirectingToStripe !== null}
              >
                {redirectingToStripe === 'annual' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue with annual plan
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter>
              <Button
                type="button"
                onClick={() =>
                  void purchaseBranchSlot({ openAddBranchAfter: openAddBranchAfterSlotPurchase })
                }
                disabled={redirectingToStripe !== null}
              >
                {redirectingToStripe === 'branch' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Yes — charge my card ${priceBranch}/mo
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteBranchTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingBranch) setDeleteBranchTarget(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove branch &ldquo;{deleteBranchTarget?.name}&rdquo;?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600 pt-1">
                <p>
                  Tables and sales linked to this branch will be <strong>unassigned</strong>, not deleted.
                </p>
                <p>
                  Your <strong>paid branch slot stays active</strong> — you can add a different branch
                  without paying again.
                </p>
                <p className="text-slate-500">
                  To stop the ${priceBranch}/month charge for an unused slot, use{' '}
                  <strong>Release unused slot</strong> on this page after removing the branch.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteBranchTarget(null)}
              disabled={deletingBranch}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeleteBranch()}
              disabled={deletingBranch}
            >
              {deletingBranch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={releaseSlotModalOpen} onOpenChange={setReleaseSlotModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Release {unusedBranchSlots} unused branch slot{unusedBranchSlots === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600 pt-1">
                <p>
                  You will <strong>stop paying ${priceBranch}/month</strong> for each released slot.
                  Stripe may apply a small credit on your next invoice.
                </p>
                <p>
                  This does <strong>not</strong> delete any branch still listed above. Only release slots
                  you no longer need.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReleaseSlotModalOpen(false)}
              disabled={redirectingToStripe === 'branch'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void confirmReleaseUnusedBranchSlot()}
              disabled={redirectingToStripe === 'branch'}
            >
              {redirectingToStripe === 'branch' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Release slot{unusedBranchSlots === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={branchSlotConfirmOpen} onOpenChange={setBranchSlotConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm extra branch — ${priceBranch}/month</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600 pt-1">
                <p>
                  You are about to add <strong>1 extra branch slot</strong> to your subscription.
                </p>
                <p>
                  Your saved payment method will be <strong>charged now</strong> (Stripe may bill a
                  prorated amount for the rest of this billing period, then{' '}
                  <strong>${priceBranch}/month</strong> for this branch going forward).
                </p>
                <p className="text-slate-500">
                  After confirming, you can enter the new branch name and details.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBranchSlotConfirmOpen(false)}
              disabled={redirectingToStripe === 'branch'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() =>
                void purchaseBranchSlot({ openAddBranchAfter: openAddBranchAfterSlotPurchase })
              }
              disabled={redirectingToStripe === 'branch'}
            >
              {redirectingToStripe === 'branch' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Yes, charge my card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
