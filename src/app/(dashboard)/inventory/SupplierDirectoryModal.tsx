'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Mail, MessageCircle, Pencil, Plus, Save, Trash2, Truck } from 'lucide-react'

export type SupplierDirectoryEntry = {
  id: string
  name: string
  email: string
  phone: string | null
  whatsapp: string | null
  address: string | null
  leadTimeDays: number | null
  deliveryAreas: string[]
  deliveryDays: string[]
  status: string
  linkedToRestaurant: boolean
  suppliedIngredients: { id: string; name: string }[]
}

const DELIVERY_DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type SupplierFormState = {
  id?: string
  name: string
  email: string
  phone: string
  whatsapp: string
  address: string
  leadTimeDays: string
  deliveryAreas: string
  deliveryDays: string[]
}

const emptyForm: SupplierFormState = {
  name: '',
  email: '',
  phone: '',
  whatsapp: '',
  address: '',
  leadTimeDays: '',
  deliveryAreas: '',
  deliveryDays: [],
}

export function SupplierDirectoryModal({
  open,
  onOpenChange,
  onSuppliersChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuppliersChanged?: (suppliers: SupplierDirectoryEntry[]) => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [suppliers, setSuppliers] = useState<SupplierDirectoryEntry[]>([])
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null)
  const [form, setForm] = useState<SupplierFormState>(emptyForm)

  const editingSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === editingSupplierId) ?? null,
    [editingSupplierId, suppliers]
  )

  const loadSuppliers = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/suppliers')
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load suppliers')
      }
      setSuppliers(data)
      onSuppliersChanged?.(data)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load suppliers',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      void loadSuppliers()
    }
  }, [open])

  useEffect(() => {
    if (!editingSupplier) {
      setForm(emptyForm)
      return
    }

    setForm({
      id: editingSupplier.id,
      name: editingSupplier.name,
      email: editingSupplier.email,
      phone: editingSupplier.phone ?? '',
      whatsapp: editingSupplier.whatsapp ?? '',
      address: editingSupplier.address ?? '',
      leadTimeDays: editingSupplier.leadTimeDays?.toString() ?? '',
      deliveryAreas: editingSupplier.deliveryAreas.join(', '),
      deliveryDays: editingSupplier.deliveryDays,
    })
  }, [editingSupplier])

  const resetForm = () => {
    setEditingSupplierId(null)
    setForm(emptyForm)
  }

  const saveSupplier = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast({
        title: 'Missing information',
        description: 'Supplier name and email are required.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        address: form.address.trim() || null,
        leadTimeDays: form.leadTimeDays.trim() || null,
        deliveryAreas: form.deliveryAreas
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        deliveryDays: form.deliveryDays,
      }

      const response = await fetch(form.id ? `/api/suppliers/${form.id}` : '/api/suppliers', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save supplier')
      }

      const nextSuppliers = form.id
        ? suppliers.map((supplier) => (supplier.id === data.id ? data : supplier))
        : [...suppliers, data].sort((left, right) => left.name.localeCompare(right.name))

      setSuppliers(nextSuppliers)
      onSuppliersChanged?.(nextSuppliers)
      resetForm()
      toast({
        title: form.id ? 'Supplier updated' : 'Supplier added',
        description: `${data.name} is now available in the supplier directory.`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save supplier',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const removeSupplier = async (supplier: SupplierDirectoryEntry) => {
    const confirmed = window.confirm(`Remove ${supplier.name} from this restaurant?`)
    if (!confirmed) return

    try {
      const response = await fetch(`/api/suppliers/${supplier.id}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove supplier')
      }

      const nextSuppliers = suppliers.filter((entry) => entry.id !== supplier.id)
      setSuppliers(nextSuppliers)
      onSuppliersChanged?.(nextSuppliers)
      if (editingSupplierId === supplier.id) {
        resetForm()
      }
      toast({
        title: 'Supplier removed',
        description: `${supplier.name} was removed from your supplier directory.`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove supplier',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Supplier Directory</DialogTitle>
          <DialogDescription>
            Manage linked suppliers, contact details, delivery schedules, and the ingredients they support.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Linked Suppliers</h3>
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Supplier
              </Button>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Loading suppliers...
                </div>
              ) : suppliers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No suppliers yet. Add your first supplier to start linking ingredients and sending stock requests.
                </div>
              ) : (
                suppliers.map((supplier) => (
                  <Card key={supplier.id} className="border-slate-200">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-slate-900">{supplier.name}</h4>
                            <Badge variant={supplier.linkedToRestaurant ? 'default' : 'secondary'}>
                              {supplier.linkedToRestaurant ? 'Linked' : supplier.status}
                            </Badge>
                            {supplier.leadTimeDays != null && (
                              <Badge variant="outline">
                                <Truck className="mr-1 h-3 w-3" />
                                {supplier.leadTimeDays} day lead
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                            <span>{supplier.phone || 'No phone'}</span>
                            <span>{supplier.whatsapp || 'No WhatsApp'}</span>
                            <span>{supplier.email}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button type="button" variant="ghost" size="icon" onClick={() => setEditingSupplierId(supplier.id)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => void removeSupplier(supplier)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 text-sm md:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Delivery Days</p>
                          <p className="mt-1 text-slate-600">
                            {supplier.deliveryDays.length > 0 ? supplier.deliveryDays.join(', ') : 'Not set'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Delivery Areas</p>
                          <p className="mt-1 text-slate-600">
                            {supplier.deliveryAreas.length > 0 ? supplier.deliveryAreas.join(', ') : 'Not set'}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Ingredients Supplied</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {supplier.suppliedIngredients.length > 0 ? (
                            supplier.suppliedIngredients.map((ingredient) => (
                              <Badge key={ingredient.id} variant="secondary">
                                {ingredient.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-slate-500">No ingredients linked yet.</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">
                {form.id ? 'Edit Supplier' : 'Add Supplier'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Save supplier contact details and delivery preferences for quick ordering.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Supplier Name</Label>
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Contact Number</Label>
                  <Input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp</Label>
                  <Input value={form.whatsapp} onChange={(event) => setForm((prev) => ({ ...prev, whatsapp: event.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea
                  rows={2}
                  value={form.address}
                  onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Lead Time (days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.leadTimeDays}
                    onChange={(event) => setForm((prev) => ({ ...prev, leadTimeDays: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Delivery Days</Label>
                  <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-white p-2">
                    {DELIVERY_DAY_OPTIONS.map((day) => {
                      const selected = form.deliveryDays.includes(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              deliveryDays: selected
                                ? prev.deliveryDays.filter((entry) => entry !== day)
                                : [...prev.deliveryDays, day],
                            }))
                          }
                          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            selected
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Delivery Areas</Label>
                <Input
                  value={form.deliveryAreas}
                  onChange={(event) => setForm((prev) => ({ ...prev, deliveryAreas: event.target.value }))}
                  placeholder="Baghdad, Karada, Mansour"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex gap-2">
                {form.whatsapp && (
                  <a
                    href={`https://wa.me/${form.whatsapp.replace(/[^\d]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex"
                  >
                    <Button type="button" variant="outline" size="sm">
                      <MessageCircle className="mr-2 h-4 w-4" />
                      WhatsApp
                    </Button>
                  </a>
                )}
                {form.email && (
                  <a href={`mailto:${form.email}`} className="inline-flex">
                    <Button type="button" variant="outline" size="sm">
                      <Mail className="mr-2 h-4 w-4" />
                      Email
                    </Button>
                  </a>
                )}
              </div>

              <div className="flex gap-2">
                {form.id && (
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
                <Button type="button" onClick={() => void saveSupplier()} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Add Supplier'}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
