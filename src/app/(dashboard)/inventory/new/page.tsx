'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ArrowLeft, Save, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

const UNIT_OPTIONS = [
  { value: 'g', label: 'Grams (g)' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'ml', label: 'Millilitres (ml)' },
  { value: 'L', label: 'Litres (L)' },
  { value: 'piece', label: 'Piece / Each' },
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
    purchaseFormat: 'Purchase Format (e.g. 1kg bag)',
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
    purchaseFormat: 'فۆرماتی کڕین (وەک: 1kg bag)',
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
    purchaseFormat: 'تنسيق الشراء (مثال: كيس 1 كجم)',
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    unit: 'g',
    notes: '',
    variants: [] as {
      brand: string
      supplier: string
      purchaseFormat: string
      packageQuantity: string
      packageUnit: string
      bulkPrice: string
    }[],
  })

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

  const updateVariant = (index: number, field: string, value: string) => {
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
        purchaseFormat: v.purchaseFormat.trim() || null,
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
          unit: formData.unit,
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

            <div className="grid gap-6 md:grid-cols-2">
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
                <Label htmlFor="unit">
                  {copy.unit} <span className="text-red-500">*</span>
                </Label>
                <select
                  id="unit"
                  required
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{copy.units[opt.value as keyof typeof copy.units]}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  {copy.unitHintPrefix} {formData.unit}.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-lg font-semibold">{copy.variants}</Label>

              {formData.variants.length === 0 ? (
                <p className="text-slate-500 italic">No variants yet — add your first one below.</p>
              ) : (
                <Accordion type="multiple" defaultValue={['variant-0']} className="space-y-3">
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
                                Variant #{index + 1}
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
                                  {copy.brand} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  value={variant.brand}
                                  onChange={(e) => updateVariant(index, 'brand', e.target.value)}
                                  placeholder="e.g. Lurpak, Sadia, Fresh Farm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>{copy.supplier}</Label>
                                <Input
                                  value={variant.supplier}
                                  onChange={(e) => updateVariant(index, 'supplier', e.target.value)}
                                  placeholder={copy.abc}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>{copy.purchaseFormat}</Label>
                              <Input
                                value={variant.purchaseFormat}
                                onChange={(e) => updateVariant(index, 'purchaseFormat', e.target.value)}
                                placeholder="e.g. 1kg bag, 6-pack, 24-piece crate"
                              />
                            </div>

                            <div className="grid gap-6 md:grid-cols-3">
                              <div className="space-y-2">
                                <Label>{copy.packageSize}</Label>
                                <Input
                                  type="number"
                                  step="any"
                                  value={variant.packageQuantity}
                                  onChange={(e) => updateVariant(index, 'packageQuantity', e.target.value)}
                                  placeholder="5"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>{copy.packageUnit}</Label>
                                <select
                                  value={variant.packageUnit}
                                  onChange={(e) => updateVariant(index, 'packageUnit', e.target.value)}
                                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                                >
                                  {UNIT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {copy.units[opt.value as keyof typeof copy.units]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-2">
                                <Label>{copy.bulkPrice}</Label>
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
                                {copy.calculatedCostPrefix}{' '}
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
                {copy.addVariant}
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
    </div>
  )
}
