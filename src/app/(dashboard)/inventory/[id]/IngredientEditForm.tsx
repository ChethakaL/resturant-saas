'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { useDynamicTranslate } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Save, Trash2, Calculator, Upload, History, ExternalLink, Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { format } from 'date-fns'
import ReceiptUploadModal from '@/components/inventory/ReceiptUploadModal'

const UNIT_OPTIONS = [
  { value: 'g', label: 'Grams (g)' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'ml', label: 'Millilitres (ml)' },
  { value: 'L', label: 'Litres (L)' },
  { value: 'piece', label: 'Piece / Each' },
]

type IngredientWithSupplier = {
  id: string
  name: string
  unit: string
  costPerUnit: number
  minStockLevel: number
  supplier: string | null
  notes: string | null
  preferredSupplierId: string | null
  brand: string | null
  parentId: string | null
  purchaseFormat: string | null
  packageSize: number | null
  purchasePrice: number | null
  deliveries?: any[]
}

type SupplierOption = { id: string; name: string }

export default function IngredientEditForm({
  ingredient,
}: {
  ingredient: IngredientWithSupplier
}) {
  const router = useRouter()
  const { t } = useI18n()
  const { t: td, fetchTranslation } = useDynamicTranslate()
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [parentOptions, setParentOptions] = useState<{ id: string, name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [displayName, setDisplayName] = useState(ingredient.name)
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: ingredient.name,
    unit: ingredient.unit,
    costPerUnit: ingredient.costPerUnit.toString(),
    supplier: ingredient.supplier || '',
    preferredSupplierId: ingredient.preferredSupplierId || '',
    notes: ingredient.notes || '',
    brand: ingredient.brand || '',
    parentId: ingredient.parentId || '',
    purchaseFormat: ingredient.purchaseFormat || '',
    packageSize: ingredient.packageSize?.toString() || '',
    purchasePrice: ingredient.purchasePrice?.toString() || '',
  })

  useEffect(() => {
    fetch('/api/suppliers')
      .then((res) => (res.ok ? res.json() : []))
      .then(setSuppliers)

    fetch('/api/inventory')
      .then((res) => (res.ok ? res.json() : []))
      .then(data => {
        if (Array.isArray(data)) {
          setParentOptions(data.filter(i => i.id !== ingredient.id && !i.parentId))
        }
      })
  }, [ingredient.id])

  useEffect(() => {
    const size = parseFloat(formData.packageSize)
    const price = parseFloat(formData.purchasePrice)
    if (size > 0 && price >= 0) {
      const calculatedCost = price / size
      setFormData(prev => ({ ...prev, costPerUnit: calculatedCost.toFixed(3) }))
    }
  }, [formData.packageSize, formData.purchasePrice])

  useEffect(() => {
    let cancelled = false
    const loadTranslatedName = async () => {
      const translated = await fetchTranslation(ingredient.name)
      if (!cancelled) setDisplayName(translated)
    }
    void loadTranslatedName()
    return () => {
      cancelled = true
    }
  }, [fetchTranslation, ingredient.name])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    const cost = parseFloat(formData.costPerUnit)
    if (!cost || cost <= 0) {
      alert(td('Cost per unit must be greater than 0.'))
      return
    }
    setLoading(true)

    try {
      const response = await fetch(`/api/inventory/${ingredient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          unit: formData.unit,
          costPerUnit: cost,
          supplier: formData.supplier || null,
          preferredSupplierId: formData.preferredSupplierId || null,
          notes: formData.notes || null,
          brand: formData.brand || null,
          parentId: formData.parentId || null,
          purchaseFormat: formData.purchaseFormat || null,
          packageSize: formData.packageSize || null,
          purchasePrice: formData.purchasePrice || null,
        }),
      })

      if (!response.ok) {
        throw new Error(td('Failed to update ingredient'))
      }

      router.push('/inventory')
      router.refresh()
    } catch (error) {
      console.error('Error updating ingredient:', error)
      alert(td('Failed to update ingredient. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(td('Are you sure you want to delete this ingredient? This action cannot be undone.'))) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/inventory/${ingredient.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(td('Failed to delete ingredient'))
      }

      router.push('/inventory')
      router.refresh()
    } catch (error) {
      console.error('Error deleting ingredient:', error)
      alert(td('Failed to delete ingredient. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/inventory">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t.common_back}
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{td('Edit Ingredient')}</h1>
            <p className="text-slate-500 mt-1">{td('Update ingredient details')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => setIsReceiptModalOpen(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {td('Upload Receipt')}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            <Trash2 className="h-4 w-4 mr-2" />
            {t.inventory_delete_btn}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{td('Ingredient Details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdate} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  {td('Ingredient Name')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  required
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value)
                    setFormData({ ...formData, name: e.target.value })
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">{td('Brand')}</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  placeholder={td('e.g. Lurpak')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parentId">{td('Parent Ingredient (for Variants)')}</Label>
                <select
                  id="parentId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                >
                  <option value="">{td('— None (This is a Parent) —')}</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>{td(p.name)}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">
                  {td('Unit of Measure')} <span className="text-red-500">*</span>
                </Label>
                <select
                  id="unit"
                  required
                  value={UNIT_OPTIONS.some((o) => o.value === formData.unit) ? formData.unit : formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{td(opt.label)}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="costPerUnit">
                  {td('Cost Per')} {td(formData.unit)} (IQD) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="costPerUnit"
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={formData.costPerUnit}
                  onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                />
                <p className="text-xs text-slate-500">{td('Must be greater than 0.')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier">{td('Supplier (text)')}</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder={td('e.g. Al-Anbar Rice Traders')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferredSupplierId">{td('Preferred supplier (for Request stock)')}</Label>
                <select
                  id="preferredSupplierId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.preferredSupplierId}
                  onChange={(e) => setFormData({ ...formData, preferredSupplierId: e.target.value })}
                >
                  <option value="">{td('— None —')}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {td(s.name)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  {td('Choose a supplier to enable "Request more" on the inventory page.')}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 space-y-4 bg-slate-50/50">
              <div className="flex items-center gap-2 text-slate-900 font-semibold">
                <Calculator className="h-4 w-4" />
                <h3>{td('Packaging & Purchase Format')}</h3>
              </div>
              <p className="text-xs text-slate-500">{td('Enter bulk purchase details to auto-calculate the cost per unit.')}</p>
              
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="purchaseFormat">{td('Purchase Format')}</Label>
                  <Input
                    id="purchaseFormat"
                    value={formData.purchaseFormat}
                    onChange={(e) => setFormData({ ...formData, purchaseFormat: e.target.value })}
                    placeholder={td('e.g. 5kg bag, 6-pack')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packageSize">{td('Package Size')} ({td(formData.unit)})</Label>
                  <Input
                    id="packageSize"
                    type="number"
                    step="any"
                    value={formData.packageSize}
                    onChange={(e) => setFormData({ ...formData, packageSize: e.target.value })}
                    placeholder="e.g. 5000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchasePrice">{td('Purchase Price (IQD)')}</Label>
                  <Input
                    id="purchasePrice"
                    type="number"
                    step="any"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    placeholder="e.g. 25000"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{td('Notes')}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Link href="/inventory">
                <Button type="button" variant="outline" disabled={loading}>
                  {t.common_cancel}
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? td('Saving...') : td('Save Changes')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-indigo-600" />
            {td('Purchase & Delivery History')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!ingredient.deliveries || ingredient.deliveries.length === 0 ? (
            <div className="text-center py-8 text-slate-500 italic">
              {td('No delivery history found for this ingredient.')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 font-semibold text-slate-700">{td('Date')}</th>
                    <th className="text-left py-3 px-2 font-semibold text-slate-700">{td('Supplier')}</th>
                    <th className="text-right py-3 px-2 font-semibold text-slate-700">{td('Quantity')}</th>
                    <th className="text-right py-3 px-2 font-semibold text-slate-700">{td('Unit Cost')}</th>
                    <th className="text-right py-3 px-2 font-semibold text-slate-700">{td('Total')}</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-700">{td('Receipt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredient.deliveries.map((delivery) => (
                    <tr key={delivery.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-2 text-slate-600">
                        <div className="flex items-center gap-1">
                          <History className="h-3 w-3" />
                          {format(new Date(delivery.deliveryDate), 'MMM d, yyyy')}
                        </div>
                      </td>
                      <td className="py-3 px-2 font-medium text-slate-900">{td(delivery.supplierName)}</td>
                      <td className="py-3 px-2 text-right">{delivery.quantity} {td(ingredient.unit)}</td>
                      <td className="py-3 px-2 text-right font-mono">{formatCurrency(delivery.unitCost)}</td>
                      <td className="py-3 px-2 text-right font-mono font-semibold">{formatCurrency(delivery.totalCost)}</td>
                      <td className="py-3 px-2 text-center">
                        {delivery.receipt?.imageUrl ? (
                          <a 
                            href={delivery.receipt.imageUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center p-1.5 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors"
                            title={td('View Receipt')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <ReceiptUploadModal 
        isOpen={isReceiptModalOpen} 
        onClose={() => setIsReceiptModalOpen(false)} 
        ingredientId={ingredient.id} 
      />
    </div>
  )
}
