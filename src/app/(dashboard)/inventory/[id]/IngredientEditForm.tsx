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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, Save, Trash2, Plus, ArrowUp, ArrowDown, Upload, ExternalLink, FileText, Building2 } from 'lucide-react'
import Link from 'next/link'
import UploadReceiptModal from '../UploadReceiptModal'
import { SupplierDirectoryModal, type SupplierDirectoryEntry } from '../SupplierDirectoryModal'
import { DEFAULT_INVENTORY_CATEGORY, INVENTORY_CATEGORY_OPTIONS } from '@/lib/inventory-categories'

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
  packageQuantity: string
  packageUnit: string
  bulkPrice: string
}

type IngredientWithVariants = {
  id: string
  name: string
  category?: string | null
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

type SupplierOption = SupplierDirectoryEntry
type PurchaseHistoryEntry = {
  id: string
  source: 'delivery' | 'expense'
  date: string
  supplier: string | null
  quantity: number | null
  unit: string
  totalPrice: number
  unitCost: number
  notes: string | null
  receiptImageUrl: string | null
}

function ReceiptPreview({
  url,
  alt,
  viewLabel,
  unavailableLabel,
}: {
  url: string
  alt: string
  viewLabel: string
  unavailableLabel: string
}) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div className="flex items-start gap-3">
      {!imageFailed ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="group block"
          aria-label={viewLabel}
        >
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition group-hover:border-slate-300 group-hover:shadow">
            <img
              src={url}
              alt={alt}
              className="h-16 w-16 object-cover"
              onError={() => setImageFailed(true)}
            />
          </div>
        </a>
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
          <FileText className="h-5 w-5" />
        </div>
      )}

      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium text-slate-700">
          {imageFailed ? unavailableLabel : alt}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <span>{viewLabel}</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

export default function IngredientEditForm({
  ingredient,
  purchaseHistory,
}: {
  ingredient: IngredientWithVariants
  purchaseHistory: PurchaseHistoryEntry[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const { t: td, fetchTranslation } = useDynamicTranslate()
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState(ingredient.name)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: ingredient.name,
    category: ingredient.category || DEFAULT_INVENTORY_CATEGORY,
    unit: ingredient.unit,
    preferredSupplierId: ingredient.preferredSupplierId || '',
    notes: ingredient.notes || '',
    variants: ingredient.variants.map((v) => ({
      id: v.id,
      brand: v.brand,
      supplier: v.supplier || '',
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

  const [expandedVariants, setExpandedVariants] = useState<string[]>(['variant-0'])

  const addVariant = () => {
    const newIndex = formData.variants.length
    setFormData((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        {
          brand: '',
          supplier: '',
          packageQuantity: '',
          packageUnit: prev.unit,
          bulkPrice: '',
        },
      ],
    }))
    setExpandedVariants((prev) => [...prev, `variant-${newIndex}`])
  }

  const removeVariant = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }))
    setExpandedVariants((prev) =>
      prev
        .filter((v) => v !== `variant-${index}`)
        .map((v) => {
          const num = parseInt(v.replace('variant-', ''), 10)
          if (Number.isFinite(num) && num > index) return `variant-${num - 1}`
          return v
        })
    )
  }

  const updateVariant = (index: number, field: keyof VariantType, value: string) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, [field]: value } : v
      ),
    }))
  }

  const moveUp = (index: number) => {
    if (index <= 0) return
    setFormData((prev) => {
      const newVariants = [...prev.variants]
        ;[newVariants[index - 1], newVariants[index]] = [newVariants[index], newVariants[index - 1]]
      return { ...prev, variants: newVariants }
    })
  }

  const moveDown = (index: number) => {
    if (index >= formData.variants.length - 1) return
    setFormData((prev) => {
      const newVariants = [...prev.variants]
        ;[newVariants[index], newVariants[index + 1]] = [newVariants[index + 1], newVariants[index]]
      return { ...prev, variants: newVariants }
    })
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
          category: formData.category,
          unit: formData.unit,
          preferredSupplierId: formData.preferredSupplierId || null,
          notes: formData.notes.trim() || null,
          variants: processedVariants,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const detail = errData?.detail ?? errData?.error
        throw new Error(typeof detail === 'string' ? detail : td('Failed to update ingredient'))
      }

      router.push('/inventory')
      router.refresh()
    } catch (error) {
      console.error('Error updating ingredient:', error)
      setError(error instanceof Error ? error.message : td('Failed to update ingredient. Please try again.'))
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
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setReceiptModalOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {td('Upload Receipt')}
          </Button>

          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            <Trash2 className="h-4 w-4 mr-2" />
            {t.inventory_delete_btn}
          </Button>
        </div>
      </div>

      <UploadReceiptModal
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
        ingredientId={ingredient.id}
      />

      <Card>
        <CardHeader>
          <CardTitle>{td('Ingredient Details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="details" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">{td('Details')}</TabsTrigger>
              <TabsTrigger value="purchase-history">
                {td('Purchase History')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details">
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
                <Label htmlFor="category">
                  {td('Category')} <span className="text-red-500">*</span>
                </Label>
                <select
                  id="category"
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {INVENTORY_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {td(option.label)}
                    </option>
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
              <div className="flex gap-2">
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
                <Button type="button" variant="outline" onClick={() => setSupplierModalOpen(true)}>
                  <Building2 className="mr-2 h-4 w-4" />
                  {td('Manage')}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                {td('Choose a supplier to enable "Request more" on the inventory page.')}
              </p>
            </div>

            <div className="space-y-4">
              <Label className="text-lg font-semibold">{td('Variants (Brands)')}</Label>

              {formData.variants.length === 0 ? (
                <p className="text-slate-500 italic">{td('No variants yet — add your first one below.')}</p>
              ) : (
                <Accordion
                  type="multiple"
                  value={expandedVariants}
                  onValueChange={setExpandedVariants}
                  className="space-y-3"
                >
                  {formData.variants.map((variant, index) => {
                    const calcCost = calculateCostPerUnit(variant)
                    return (
                      <AccordionItem
                        key={index}
                        value={`variant-${index}`}
                        className="border border-slate-200 rounded-xl overflow-hidden bg-white"
                      >
                        <AccordionTrigger className="px-6 py-4 hover:no-underline items-center">
                          <div className="flex w-full items-center justify-between">
                            <div className="flex items-center gap-4">
                              <h3 className="font-medium">
                                {td('Variant')} #{index + 1}
                                {variant.brand ? ` - ${variant.brand}` : ''}
                              </h3>
                              {calcCost > 0 && (
                                <span className="text-sm font-semibold text-green-600">
                                  {calcCost.toFixed(2)} IQD/{formData.unit}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {index > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    moveUp(index)
                                  }}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                              )}
                              {index < formData.variants.length - 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    moveDown(index)
                                  }}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeVariant(index)
                                }}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="px-6 pb-6 pt-2 border-t">
                          <div className="space-y-6">
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
                                <select
                                  value={variant.supplier}
                                  onChange={(e) => updateVariant(index, 'supplier', e.target.value)}
                                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                                >
                                  <option value="">{td('— None —')}</option>
                                  {suppliers.map((supplier) => (
                                    <option key={supplier.id} value={supplier.name}>
                                      {td(supplier.name)}
                                    </option>
                                  ))}
                                </select>
                              </div>
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
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              )}

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
            </TabsContent>

            <TabsContent value="purchase-history">
              <div className="space-y-4">
                {purchaseHistory.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    {td('No purchase history yet. Record deliveries or confirm receipts to track cost changes over time.')}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                          <th className="px-4 py-3 font-medium">{td('Date')}</th>
                          <th className="px-4 py-3 font-medium">{td('Supplier')}</th>
                          <th className="px-4 py-3 font-medium">{td('Quantity purchased')}</th>
                          <th className="px-4 py-3 font-medium">{td('Price paid')}</th>
                          <th className="px-4 py-3 font-medium">{td('Cost/unit')}</th>
                          <th className="px-4 py-3 font-medium">{td('Receipt')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseHistory.map((entry) => (
                          <tr key={entry.id} className="border-b border-slate-100 align-top">
                            <td className="px-4 py-3 text-slate-700">
                              {new Date(entry.date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div>{entry.supplier || '—'}</div>
                              <div className="text-xs text-slate-400 capitalize">{entry.source}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {entry.quantity != null ? `${entry.quantity} ${entry.unit}` : '—'}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-800">
                              {formatCurrency(entry.totalPrice)}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-800">
                              {formatCurrency(entry.unitCost)}
                            </td>
                            <td className="px-4 py-3">
                              {entry.receiptImageUrl ? (
                                <ReceiptPreview
                                  url={entry.receiptImageUrl}
                                  alt={td('Receipt preview')}
                                  viewLabel={td('View receipt')}
                                  unavailableLabel={td('Preview unavailable')}
                                />
                              ) : (
                                <div className="flex items-start gap-3">
                                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                                    <FileText className="h-5 w-5" />
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-slate-700">{td('No receipt image')}</p>
                                    <p className="text-xs text-slate-400">
                                      {td('This purchase was saved without an uploaded image.')}
                                    </p>
                                  </div>
                                </div>
                              )}
                              {entry.notes && (
                                <p className="mt-2 max-w-xs text-xs text-slate-500">{entry.notes}</p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <SupplierDirectoryModal
        open={supplierModalOpen}
        onOpenChange={setSupplierModalOpen}
        onSuppliersChanged={(nextSuppliers) => setSuppliers(nextSuppliers)}
      />
    </div>
  )
}
