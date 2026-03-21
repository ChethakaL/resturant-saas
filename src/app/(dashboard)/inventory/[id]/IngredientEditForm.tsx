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
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import Calendar from '@/components/ui/calendar'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { ArrowLeft, Save, Trash2, Plus, Upload, ExternalLink, FileText, Building2, CalendarDays, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import UploadReceiptModal from '../UploadReceiptModal'
import { SupplierDirectoryModal, type SupplierDirectoryEntry } from '../SupplierDirectoryModal'
import { DEFAULT_INVENTORY_CATEGORY } from '@/lib/inventory-categories'

function PurchaseDateField({
  value,
  onChange,
  locale,
}: {
  value: string
  onChange: (value: string) => void
  locale: 'en' | 'ku' | 'ar-fusha'
}) {
  const selectedDate = value ? new Date(value) : null
  const [month, setMonth] = useState<Date>(selectedDate ?? new Date())

  useEffect(() => {
    if (selectedDate) {
      setMonth(selectedDate)
    }
  }, [value])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
        >
          <span>{selectedDate ? format(selectedDate, 'PPP') : 'Select purchase date'}</span>
          <CalendarDays className="h-4 w-4 text-slate-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <Calendar
          locale={locale}
          month={month}
          selected={selectedDate}
          onSelect={(date) => onChange(format(date, 'yyyy-MM-dd'))}
          onMonthChange={setMonth}
        />
      </PopoverContent>
    </Popover>
  )
}

const UNIT_OPTIONS = [
  { value: 'g', label: 'Grams (g)' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'ml', label: 'Millilitres (ml)' },
  { value: 'L', label: 'Litres (L)' },
  { value: 'piece', label: 'Piece / Each' },
]

const PACKAGE_TYPE_OPTIONS = [
  'Bag',
  'Bottle',
  'Box',
  'Can',
  'Carton',
  'Jar',
  'Pack',
  'Piece',
  'Sack',
  'Tray',
]

type VariantType = {
  id?: string
  brand: string
  supplier: string
  purchaseFormat: string
  purchaseDate: string
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
    purchaseDate?: string | Date | null
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
  const { t, locale } = useI18n()
  const { t: td, fetchTranslation } = useDynamicTranslate()
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState(ingredient.name)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [purchaseHistoryPage, setPurchaseHistoryPage] = useState(1)
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
      purchaseFormat: v.purchaseFormat || 'Bag',
      purchaseDate: v.purchaseDate ? new Date(v.purchaseDate).toISOString().slice(0, 10) : '',
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
          supplier: selectedPreferredSupplier?.name || '',
          purchaseFormat: 'Bag',
          purchaseDate: '',
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
        supplier: selectedPreferredSupplier?.name || null,
        purchaseFormat: v.purchaseFormat || null,
        purchaseDate: v.purchaseDate || null,
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

  const selectedPreferredSupplier = suppliers.find((supplier) => supplier.id === formData.preferredSupplierId)
  const purchaseHistoryPageSize = 5
  const purchaseHistoryPageCount = Math.max(1, Math.ceil(purchaseHistory.length / purchaseHistoryPageSize))
  const paginatedPurchaseHistory = purchaseHistory.slice(
    (purchaseHistoryPage - 1) * purchaseHistoryPageSize,
    purchaseHistoryPage * purchaseHistoryPageSize
  )

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
          <form onSubmit={handleUpdate} className="space-y-8">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Card className="border-slate-200 shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm uppercase tracking-[0.2em] text-slate-600">{td('Ingredient Details')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
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
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm uppercase tracking-[0.2em] text-slate-600">SUPPLIER</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="preferredSupplierId">Supplier name(s)</Label>
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
                      + Add
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedPreferredSupplier ? `${td('Current')}: ${td(selectedPreferredSupplier.name)}` : td('Choose the supplier you normally buy from.')}
                  </p>
                </div>

              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">PURCHASE INFO</Label>
                <p className="text-sm text-slate-500">
                  {td('Add the brand you buy, optional purchase date, purchase type, and price. Then choose how this ingredient is used in recipes so the system can calculate the cost correctly.')}
                </p>
              </div>

              {formData.variants.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  {td('No package options yet. Add your first one below to continue.')}
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.variants.map((variant, index) => {
                    const calcCost = calculateCostPerUnit(variant)
                    return (
                      <Card key={index} className="border-slate-200 shadow-none">
                        <CardHeader className="pb-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <CardTitle className="text-base">
                                {td('Package Option')} #{index + 1}
                              </CardTitle>
                              <p className="mt-1 text-sm text-slate-500">
                                {variant.brand ? `${td('Brand')}: ${variant.brand}` : td('Fill the details below for this package option.')}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeVariant(index)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>
                                {td('Brand')} <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                value={variant.brand}
                                onChange={(e) => updateVariant(index, 'brand', e.target.value)}
                                placeholder={td('e.g. Lurpak, Lavazza, Fresh Farm')}
                              />
                              <p className="text-xs text-slate-500">
                                Supplier comes from the main supplier selection above{selectedPreferredSupplier ? `: ${selectedPreferredSupplier.name}.` : '.'}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label>Purchase date (optional)</Label>
                              <PurchaseDateField
                                value={variant.purchaseDate}
                                onChange={(value) => updateVariant(index, 'purchaseDate', value)}
                                locale={locale}
                              />
                              <p className="text-xs text-slate-500">
                                Leave this empty if you want to upload a receipt later and fill it automatically.
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Package type</Label>
                              <select
                                value={variant.purchaseFormat}
                                onChange={(e) => updateVariant(index, 'purchaseFormat', e.target.value)}
                                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                              >
                                {PACKAGE_TYPE_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <Label>Package price (IQD)</Label>
                              <Input
                                type="number"
                                step="any"
                                value={variant.bulkPrice}
                                onChange={(e) => updateVariant(index, 'bulkPrice', e.target.value)}
                                placeholder="25000"
                              />
                            </div>
                          </div>

                          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div>
                              <Label className="text-sm font-medium text-slate-800">Unit of use</Label>
                              <p className="mt-1 text-sm text-slate-600">{td('How is this ingredient measured in recipes? This applies to all package options.')}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {UNIT_OPTIONS.map((opt) => {
                                const active = formData.unit === opt.value
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, unit: opt.value })}
                                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                                      active
                                        ? 'border-emerald-600 bg-emerald-600 text-white'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                    }`}
                                  >
                                    {td(opt.label)}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Total {formData.unit} in package</Label>
                            <Input
                              type="number"
                              step="any"
                              value={variant.packageQuantity}
                              onChange={(e) => updateVariant(index, 'packageQuantity', e.target.value)}
                              placeholder="1000"
                            />
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="text-sm font-medium text-slate-700">
                                {`${td('Calculated cost per')} ${formData.unit}`}
                              </span>
                              <Badge variant="secondary" className="bg-white px-3 py-1 text-sm text-slate-900">
                                {calcCost > 0
                                  ? `${calcCost.toFixed(2)} IQD`
                                  : td('Waiting for complete price details')}
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              <Button type="button" onClick={addVariant} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {td('Add Package Option')}
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

      <Card>
        <CardHeader>
          <CardTitle>{td('Purchase History')}</CardTitle>
          <p className="text-sm text-slate-500">
            {td('Purchase dates are added automatically from deliveries and receipts.')}
          </p>
        </CardHeader>
        <CardContent>
          {purchaseHistory.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {td('No purchase history yet. Record deliveries or confirm receipts to track cost changes over time.')}
            </div>
          ) : (
            <>
            <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200">
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
                  {paginatedPurchaseHistory.map((entry) => (
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
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {td('Showing')} {(purchaseHistoryPage - 1) * purchaseHistoryPageSize + 1}
                {' - '}
                {Math.min(purchaseHistoryPage * purchaseHistoryPageSize, purchaseHistory.length)}
                {' '}
                {td('of')} {purchaseHistory.length}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={purchaseHistoryPage === 1}
                  onClick={() => setPurchaseHistoryPage((prev) => Math.max(1, prev - 1))}
                >
                  {td('Previous')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={purchaseHistoryPage === purchaseHistoryPageCount}
                  onClick={() => setPurchaseHistoryPage((prev) => Math.min(purchaseHistoryPageCount, prev + 1))}
                >
                  {td('Next')}
                </Button>
              </div>
            </div>
            </>
          )}
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
