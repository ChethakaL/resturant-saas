'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import Calendar from '@/components/ui/calendar'
import { format } from 'date-fns'
import { ArrowLeft, Save, Plus, Trash2, Building2, CalendarDays, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { SupplierDirectoryModal, type SupplierDirectoryEntry } from '../SupplierDirectoryModal'
import { DEFAULT_INVENTORY_CATEGORY, INVENTORY_CATEGORY_OPTIONS } from '@/lib/inventory-categories'

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

const INVENTORY_COPY = {
  en: {
    back: 'Back',
    title: 'Add New Ingredient',
    subtitle: 'Add a new ingredient to your inventory',
    details: 'Ingredient Details',
    ingredientName: 'Ingredient Name',
    unit: 'Unit of Measure',
    costPer: 'Cost Per',
    supplier: 'Supplier',
    notes: 'Notes',
    save: 'Save Ingredient',
    cancel: 'Cancel',
    chicken: 'e.g., Chicken Breast',
    abc: 'e.g., ABC Suppliers',
    costPlaceholder: 'e.g., 5000',
    notesPlaceholder: 'Additional notes about this ingredient...',
    unitHintPrefix: 'Cost per unit will be in IQD per',
    greater: 'Must be greater than 0.',
    createFailed: 'Failed to create ingredient. Please try again.',
    costError: 'Cost per unit must be greater than 0.',
    units: { g: 'Grams (g)', kg: 'Kilograms (kg)', ml: 'Millilitres (ml)', L: 'Litres (L)', piece: 'Piece / Each' },
    brand: 'Brand',
    variants: 'Variants (Brands)',
    addVariant: 'Add Variant',
    removeVariant: 'Remove Variant',
    packageSize: 'Package Size',
    packageUnit: 'Package Unit',
    bulkPrice: 'Bulk Purchase Price (IQD)',
    calculatedCostPrefix: 'Calculated cost per',
    nameRequired: 'Ingredient name is required.',
    variantRequired: 'At least one variant is required.',
    costErrorVariant: 'Each variant must have a valid cost > 0 after calculation.',
    saving: 'Saving...',
  },
  ku: {
    back: 'گەڕانەوە',
    title: 'زیادکردنی پێکهاتەی نوێ',
    subtitle: 'پێکهاتەیەکی نوێ زیاد بکە بۆ کۆگاکەت',
    details: 'وردەکارییەکانی پێکهاتە',
    ingredientName: 'ناوی پێکهاتە',
    unit: 'یەکەی پێوانە',
    costPer: 'تێچوو بۆ هەر',
    supplier: 'دابینکەر',
    notes: 'تێبینی',
    save: 'پاشەکەوتکردنی پێکهاتە',
    cancel: 'هەڵوەشاندنەوە',
    chicken: 'وەک: سنگی مریشک',
    abc: 'وەک: ABC Suppliers',
    costPlaceholder: 'وەک: 5000',
    notesPlaceholder: 'تێبینییەکی زیادە لەسەر ئەم پێکهاتەیە...',
    unitHintPrefix: 'تێچوو بۆ هەر یەکە بە IQD دەبێت بۆ',
    greater: 'دەبێت لە 0 زیاتر بێت.',
    createFailed: 'دروستکردنی پێکهاتە سەرکەوتوو نەبوو. تکایە دووبارە هەوڵبدەوە.',
    costError: 'دەبێت تێچووی هەر یەکە لە 0 زیاتر بێت.',
    units: { g: 'گرام (g)', kg: 'کیلۆگرام (kg)', ml: 'میلیلیتر (ml)', L: 'لیتر (L)', piece: 'دانە / یەکە' },
    brand: 'براند',
    variants: 'جۆرەکان (براندەکان)',
    addVariant: 'زیادکردنی جۆر',
    removeVariant: 'سڕینەوەی جۆر',
    packageSize: 'قەبارەی پاکێج',
    packageUnit: 'یەکەی پاکێج',
    bulkPrice: 'نرخی کڕینی گەورە (IQD)',
    calculatedCostPrefix: 'تێچووی حەسابکراو بۆ هەر',
    nameRequired: 'ناوی پێکهاتە پێویستە.',
    variantRequired: 'دەبێت لانیکەم جۆرێک هەبێت.',
    costErrorVariant: 'دەبێت هەر جۆرێک تێچووی دروست > 0 هەبێت.',
    saving: 'پاشەکەوت دەکرێت...',
  },
  'ar-fusha': {
    back: 'رجوع',
    title: 'إضافة مكوّن جديد',
    subtitle: 'أضف مكوّناً جديداً إلى مخزونك',
    details: 'تفاصيل المكوّن',
    ingredientName: 'اسم المكوّن',
    unit: 'وحدة القياس',
    costPer: 'التكلفة لكل',
    supplier: 'المورّد',
    notes: 'ملاحظات',
    save: 'حفظ المكوّن',
    cancel: 'إلغاء',
    chicken: 'مثال: صدر دجاج',
    abc: 'مثال: ABC Suppliers',
    costPlaceholder: 'مثال: 5000',
    notesPlaceholder: 'ملاحظات إضافية حول هذا المكوّن...',
    unitHintPrefix: 'ستكون تكلفة الوحدة بالدينار العراقي لكل',
    greater: 'يجب أن تكون أكبر من 0.',
    createFailed: 'فشل إنشاء المكوّن. يرجى المحاولة مرة أخرى.',
    costError: 'يجب أن تكون تكلفة الوحدة أكبر من 0.',
    units: { g: 'غرام (g)', kg: 'كيلوغرام (kg)', ml: 'ملليلتر (ml)', L: 'لتر (L)', piece: 'قطعة / وحدة' },
    brand: 'العلامة التجارية',
    variants: 'المتغيرات (العلامات التجارية)',
    addVariant: 'إضافة متغير',
    removeVariant: 'إزالة المتغير',
    packageSize: 'حجم العبوة',
    packageUnit: 'وحدة العبوة',
    bulkPrice: 'سعر الشراء بالجملة (د.ع)',
    calculatedCostPrefix: 'التكلفة المحسوبة لكل',
    nameRequired: 'اسم المكوّن مطلوب.',
    variantRequired: 'يجب أن يكون هناك متغير واحد على الأقل.',
    costErrorVariant: 'يجب أن يكون لكل متغير تكلفة وحدة صالحة أكبر من 0.',
    saving: 'جاري الحفظ...',
  },
} as const
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

export default function NewIngredientPage() {
  const router = useRouter()
  const { locale } = useI18n()
  const copy = INVENTORY_COPY[locale] ?? INVENTORY_COPY.en
  const [suppliers, setSuppliers] = useState<SupplierDirectoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    category: DEFAULT_INVENTORY_CATEGORY,
    unit: 'g',
    preferredSupplierId: '',
    notes: '',
    variants: [] as {
      brand: string
      supplier: string
      purchaseFormat: string
      purchaseDate: string
      packageQuantity: string
      packageUnit: string
      bulkPrice: string
    }[],
  })

  useEffect(() => {
    fetch('/api/suppliers')
      .then((res) => (res.ok ? res.json() : []))
      .then(setSuppliers)
      .catch(() => setSuppliers([]))
  }, [])

  const calculateCostPerUnit = (variant: any) => {
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

  const updateVariant = (index: number, field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, [field]: value } : v
      ),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.name.trim()) {
      setError(copy.nameRequired)
      return
    }
    if (formData.variants.length === 0) {
      setError(copy.variantRequired)
      return
    }

    const processedVariants = formData.variants.map((v) => {
      const cost = calculateCostPerUnit(v)
      return {
        brand: v.brand.trim(),
        supplier: v.supplier.trim() || null,
        purchaseFormat: v.purchaseFormat || null,
        purchaseDate: v.purchaseDate || null,
        packageQuantity: v.packageQuantity ? parseFloat(v.packageQuantity) : null,
        packageUnit: v.packageUnit,
        bulkPrice: v.bulkPrice ? parseFloat(v.bulkPrice) : null,
        costPerUnit: cost,
      }
    })

    if (processedVariants.some((v) => !v.brand || v.costPerUnit <= 0)) {
      setError(copy.costErrorVariant)
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          category: formData.category,
          unit: formData.unit,
          preferredSupplierId: formData.preferredSupplierId || null,
          notes: formData.notes || null,
          variants: processedVariants,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create ingredient')
      }

      router.push('/inventory')
      router.refresh()
    } catch (err) {
      console.error('Error creating ingredient:', err)
      setError(copy.createFailed)
    } finally {
      setLoading(false)
    }
  }

  const selectedPreferredSupplier = suppliers.find((supplier) => supplier.id === formData.preferredSupplierId)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {copy.back}
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{copy.title}</h1>
          <p className="text-slate-500 mt-1">{copy.subtitle}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{copy.details}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Card className="border-slate-200 shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm uppercase tracking-[0.2em] text-slate-600">{copy.details}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      {copy.ingredientName} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={copy.chicken}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <select
                      id="category"
                      required
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as typeof DEFAULT_INVENTORY_CATEGORY })}
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      {INVENTORY_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      value={formData.preferredSupplierId}
                      onChange={(e) => setFormData({ ...formData, preferredSupplierId: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" onClick={() => setSupplierModalOpen(true)}>
                      <Building2 className="mr-2 h-4 w-4" />
                      + Add
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedPreferredSupplier ? `Current: ${selectedPreferredSupplier.name}` : 'Choose the supplier you normally buy from.'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    Purchase date
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Purchase dates are recorded automatically when you upload a receipt.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm uppercase tracking-[0.2em] text-slate-600">UNIT OF USE</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="mb-3 text-sm text-slate-600">How is this ingredient measured in recipes?</p>
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
                          {copy.units[opt.value as keyof typeof copy.units]}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  All package prices below will be converted automatically into cost per {formData.unit}.
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="mt-4 block text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">PURCHASE INFO</Label>
                <p className="text-sm text-slate-500">
                  Add the package or brand options you buy from suppliers. The system will calculate the cost per {formData.unit}.
                </p>
              </div>

              {formData.variants.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No package options yet. Add your first one below to continue.
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
                              <CardTitle className="text-base">Package Option #{index + 1}</CardTitle>
                              <p className="mt-1 text-sm text-slate-500">
                                {variant.brand ? `${copy.brand}: ${variant.brand}` : 'Fill the details below for this package option.'}
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
                                {copy.brand} <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                value={variant.brand}
                                onChange={(e) => updateVariant(index, 'brand', e.target.value)}
                                placeholder="e.g. Lurpak, Lavazza, Fresh Farm"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Supplier name(s)</Label>
                              <select
                                value={variant.supplier}
                                onChange={(e) => updateVariant(index, 'supplier', e.target.value)}
                                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                              >
                                <option value="">— None —</option>
                                {suppliers.map((supplier) => (
                                  <option key={supplier.id} value={supplier.name}>
                                    {supplier.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Purchase date</Label>
                            <PurchaseDateField
                              value={variant.purchaseDate}
                              onChange={(value) => updateVariant(index, 'purchaseDate', value)}
                              locale={locale}
                            />
                            <p className="text-xs text-slate-500">
                              Enter it now if you know it, or leave it empty and upload a receipt later to fill purchase details automatically.
                            </p>
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
                                {formData.unit === 'g' ? 'Cost per 100g' : `Cost per ${formData.unit}`}
                              </span>
                              <Badge variant="secondary" className="bg-white px-3 py-1 text-sm text-slate-900">
                                {calcCost > 0
                                  ? `${((formData.unit === 'g' ? calcCost * 100 : calcCost)).toFixed(0)} IQD`
                                  : 'Waiting for complete price details'}
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
                Add Package Option
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{copy.notes}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={copy.notesPlaceholder}
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Link href="/inventory">
                <Button type="button" variant="outline" disabled={loading}>
                  {copy.cancel}
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : copy.save}
              </Button>
            </div>
          </form>
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
