'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import SubscriptionTab from '@/components/settings/SubscriptionTab'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2, Plus, Trash2, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import AddBranchModal, { AddBranchFormData } from '@/components/branches/AddBranchModal'
import { useI18n } from '@/lib/i18n'

interface BillingClientProps {
  isActive: boolean
  currentPeriodEnd: string | null
  currentPlan: 'monthly' | 'annual' | null
  pricesConfigured: boolean
  maxBranches: number
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
  maxBranches,
  stripePriceBranchConfigured = false,
}: BillingClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [showAddBranch, setShowAddBranch] = useState(false)
  const [addingBranch, setAddingBranch] = useState(false)

  useEffect(() => {
    fetchBranches()
  }, [])

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
        toast({ title: 'Cannot add branch', description: data.error, variant: 'destructive' })
        throw new Error(data.error)
      }
      toast({
        title: 'Branch added',
        description: stripePriceBranchConfigured && isActive && branches.length >= 1
          ? `"${data.name}" added. You'll be charged $10/month for this branch on your next invoice.`
          : `"${data.name}" has been created.`,
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

  const handleDeleteBranch = async (id: string, name: string) => {
    if (!confirm(`Remove branch "${name}"? Tables and sales will be unassigned. Your subscription will be updated and the $10/month charge for this branch will stop at the end of the billing period.`)) return
    try {
      if (stripePriceBranchConfigured && isActive && branches.length > 1) {
        const res = await fetch('/api/billing/cancel-branch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: id }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast({ title: 'Cannot remove branch', description: data.error, variant: 'destructive' })
          return
        }
        toast({ title: 'Branch removed', description: data.message || `"${name}" has been removed.` })
      } else {
        const res = await fetch(`/api/branches/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        toast({ title: 'Branch deleted', description: `"${name}" has been removed.` })
      }
      fetchBranches()
      router.refresh()
    } catch {
      toast({ title: 'Error', description: 'Failed to remove branch', variant: 'destructive' })
    }
  }

  const additionalBranchCost = 10 // $10/month per extra branch
  const extraBranches = Math.max(0, maxBranches - 1)

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
              {t.billing_plan_includes.replace('{{count}}', String(1)).replace('{{price}}', String(additionalBranchCost))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">
              {t.billing_using_branches.replace('{{used}}', String(branches.length)).replace('{{total}}', String(maxBranches))}
            </p>
            {extraBranches > 0 && (
              <p className="text-xs text-blue-600">
                {t.billing_extra_branches_cost.replace('{{price}}', String(extraBranches * additionalBranchCost)).replace('{{count}}', String(extraBranches))}
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
              <p className="text-sm mt-1">{t.billing_add_first_branch_desc}</p>
              <Button className="mt-4" onClick={() => setShowAddBranch(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t.billing_add_first_branch}
              </Button>
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
                      onClick={() => handleDeleteBranch(branch.id, branch.name)}
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
          <Button variant="outline" className="mt-4" onClick={() => setShowAddBranch(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t.billing_add_branch}
          </Button>
        )}

        {/* Request More Branches CTA */}
        {branches.length >= maxBranches && !showAddBranch && (
          <Card className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">{t.billing_need_more_branches}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {(stripePriceBranchConfigured && isActive
                    ? t.billing_extra_branch_cost_desc_invoice
                    : t.billing_extra_branch_cost_desc
                  ).replace('{{price}}', String(additionalBranchCost))}
                </p>
              </div>
              <Button onClick={() => setShowAddBranch(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t.billing_add_branch}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
