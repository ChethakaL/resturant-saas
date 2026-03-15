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
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react'
import Link from 'next/link'

const UNIT_OPTIONS = [
  { value: 'g', label: 'Grams (g)' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'ml', label: 'Millilitres (ml)' },
  { value: 'L', label: 'Litres (L)' },
  { value: 'piece', label: 'Piece / Each' },
]

type VariantType = {
  id?: string
  brand: string
  supplier: string
  purchaseFormat: string
  packageQuantity: string
  packageUnit: string
  bulkPrice: string
}

type IngredientWithVariants = {
  id: string
  name: string
  unit: string
  minStockLevel: number
  notes: string | null
  preferredSupplierId: string | null
  variants: {
    id: number | string
    brand: string
    supplier: string | null
    purchaseFormat: string | null
    packageQuantity: number | null
    packageUnit: string
    bulkPrice: number | null
    costPerUnit: number
  }[]
}

type SupplierOption = { id: string; name: string }

export default function IngredientEditForm({
  ingredient,
}: {
  ingredient: IngredientWithVariants
}) {
  const router = useRouter()
  const { t } = useI18n()
  const { t: td, fetchTranslation } = useDynamicTranslate()
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState(ingredient.name)
  const [formData, setFormData] = useState({
    name: ingredient.name,
    unit: ingredient.unit,
    preferredSupplierId: ingredient.preferredSupplierId || '',
    notes: ingredient.notes || '',
    variants: ingredient.variants.map((v) => ({
      id: v.id,
      brand: v.brand,
      supplier: v.supplier || '',
      purchaseFormat: v.purchaseFormat || '',
      packageQuantity: v.packageQuantity?.toString() || '',
      packageUnit: v.packageUnit,
      bulkPrice: v.bulkPrice?.toString() || '',
    })) as VariantType[],
  })

  useEffect(() => {
    fetch('/api/suppliers')
      .then((res) => (res.ok ? res.json() : []))
      .then(setSuppliers)
  }, [])

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

  const convertQuantity = (qty: number, fromUnit: string, toUnit: string): number => {
    if (fromUnit === toUnit) return qty

    if (['g', 'kg'].includes(fromUnit) && ['g', 'kg'].includes(toUnit)) {
      const inGrams = fromUnit === 'kg' ? qty * 1000 : qty
      return toUnit === 'kg' ? inGrams / 1000 : inGrams
    }
    if (['ml', 'L'].includes(fromUnit) && ['ml', 'L'].includes(toUnit)) {
      const inMl = fromUnit === 'L' ? qty * 1000 : qty
      return toUnit === 'L' ? inMl / 1000 : inMl
    }
    if (fromUnit === 'piece' && toUnit === 'piece') return qty

    console.warn(`Unit mismatch: ${fromUnit} → ${toUnit}`)
    return qty
  }

  const calculateCostPerUnit = (variant: VariantType) => {
    const qty = parseFloat(variant.packageQuantity || '0')
    const price = parseFloat(variant.bulkPrice || '0')
    if (!qty || !price || qty <= 0) return 0
    const converted = convertQuantity(qty, variant.packageUnit, formData.unit)
    return converted > 0 ? price / converted : 0
  }

  const addVariant = () => {
    setFormData((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        {
          brand: '',
          supplier: '',
          purchaseFormat: '',
          packageQuantity: '',
          packageUnit: prev.unit,
          bulkPrice: '',
        },
      ],
    }))
  }

  const removeVariant = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }))
  }

  const updateVariant = (index: number, field: keyof VariantType, value: string) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, [field]: value } : v
      ),
    }))
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.name.trim()) {
      setError(td('Ingredient name is required.'))
      return
    }
    if (formData.variants.length === 0) {
      setError(td('At least one variant is required.'))
      return
    }

    const processedVariants = formData.variants.map((v) => {
      const cost = calculateCostPerUnit(v)
      return {
        id: v.id,
        brand: v.brand.trim(),
        supplier: v.supplier.trim() || null,
        purchaseFormat: v.purchaseFormat.trim() || null,
        packageQuantity: v.packageQuantity ? parseFloat(v.packageQuantity) : null,
        packageUnit: v.packageUnit,
        bulkPrice: v.bulkPrice ? parseFloat(v.bulkPrice) : null,
        costPerUnit: cost,
      }
    })

    if (processedVariants.some((v) => !v.brand || v.costPerUnit <= 0)) {
      setError(td('Each variant must have a brand and valid cost > 0.'))
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/inventory/${ingredient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          unit: formData.unit,
          preferredSupplierId: formData.preferredSupplierId || null,
          notes: formData.notes.trim() || null,
          variants: processedVariants,
        }),
      })

      if (!response.ok) {
        throw new Error(td('Failed to update ingredient'))
      }

      router.push('/inventory')
      router.refresh()
    } catch (error) {
      console.error('Error updating ingredient:', error)
      setError(td('Failed to update ingredient. Please try again.'))
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
      setError(td('Failed to delete ingredient. Please try again.'))
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
        <Button variant="destructive" onClick={handleDelete} disabled={loading}>
          <Trash2 className="h-4 w-4 mr-2" />
          {t.inventory_delete_btn}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{td('Ingredient Details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdate} className="space-y-8">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

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
                <Label htmlFor="unit">
                  {td('Unit of Measure')} <span className="text-red-500">*</span>
                </Label>
                <select
                  id="unit"
                  required
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {td(opt.label)}
                    </option>
                  ))}
                </select>
              </div>
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

            <div className="space-y-4">
              <Label className="text-lg font-semibold">{td('Variants (Brands)')}</Label>

              {formData.variants && formData.variants.length === 0 && (
                <p className="text-slate-500 italic">{td('No variants yet — add your first one below.')}</p>
              )}

              {formData.variants?.map((variant, index) => {
                const calcCost = calculateCostPerUnit(variant)
                return (
                  <div
                    key={index}
                    className="border border-slate-200 rounded-xl p-6 bg-white space-y-6"
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">{td('Variant')} #{index + 1}</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeVariant(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        {td('Remove Variant')}
                      </Button>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>
                          {td('Brand')} <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          value={variant.brand}
                          onChange={(e) => updateVariant(index, 'brand', e.target.value)}
                          placeholder={td('e.g. Lurpak, Sadia, Fresh Farm')}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{td('Supplier (text)')}</Label>
                        <Input
                          value={variant.supplier}
                          onChange={(e) => updateVariant(index, 'supplier', e.target.value)}
                          placeholder={td('e.g. Al-Anbar Rice Traders')}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{td('Purchase Format')}</Label>
                      <Input
                        value={variant.purchaseFormat}
                        onChange={(e) => updateVariant(index, 'purchaseFormat', e.target.value)}
                        placeholder={td('e.g. bag, pack, crate')}
                      />
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>{td('Package Size')}</Label>
                        <Input
                          type="number"
                          step="any"
                          value={variant.packageQuantity}
                          onChange={(e) => updateVariant(index, 'packageQuantity', e.target.value)}
                          placeholder="5"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{td('Package Unit')}</Label>
                        <select
                          value={variant.packageUnit}
                          onChange={(e) => updateVariant(index, 'packageUnit', e.target.value)}
                          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                          {UNIT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {td(opt.label)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label>{td('Bulk Purchase Price (IQD)')}</Label>
                        <Input
                          type="number"
                          step="any"
                          value={variant.bulkPrice}
                          onChange={(e) => updateVariant(index, 'bulkPrice', e.target.value)}
                          placeholder="25000"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
                      <p className="text-sm text-slate-600">
                        {td('Calculated cost per')}{' '}
                        <span className={`font-semibold ${calcCost > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {calcCost > 0 ? calcCost.toFixed(4) : '—'}
                        </span>{' '}
                        IQD / {formData.unit}
                      </p>
                    </div>
                  </div>
                )
              })}

              <Button type="button" onClick={addVariant} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {td('Add Variant')}
              </Button>
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
    </div>
  )
}