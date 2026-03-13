'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Save, Calculator } from 'lucide-react'
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
  },
} as const

export default function NewIngredientPage() {
  const router = useRouter()
  const { locale } = useI18n()
  const copy = INVENTORY_COPY[locale] ?? INVENTORY_COPY.en
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ingredients, setIngredients] = useState<{
    parentId: any id: string, name: string 
}[]>([])
  const [formData, setFormData] = useState({
    name: '',
    unit: 'g',
    costPerUnit: '',
    supplier: '',
    notes: '',
    brand: '',
    parentId: '',
    purchaseFormat: '',
    packageSize: '',
    purchasePrice: '',
  })

  useEffect(() => {
    fetch('/api/inventory')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setIngredients(data)
        }
      })
      .catch(err => console.error('Error fetching ingredients:', err))
  }, [])

  useEffect(() => {
    const size = parseFloat(formData.packageSize)
    const price = parseFloat(formData.purchasePrice)
    if (size > 0 && price >= 0) {
      const calculatedCost = price / size
      setFormData(prev => ({ ...prev, costPerUnit: calculatedCost.toFixed(3) }))
    }
  }, [formData.packageSize, formData.purchasePrice])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const cost = parseFloat(formData.costPerUnit)
    if (!cost || cost <= 0) {
      setError(copy.costError)
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
          costPerUnit: cost,
          supplier: formData.supplier || null,
          notes: formData.notes || null,
          brand: formData.brand || null,
          parentId: formData.parentId || null,
          purchaseFormat: formData.purchaseFormat || null,
          packageSize: formData.packageSize || null,
          purchasePrice: formData.purchasePrice || null,
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
          <form onSubmit={handleSubmit} className="space-y-6">
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
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  placeholder="e.g., Lurpak"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parentId">Parent Ingredient (for Variants)</Label>
                <select
                  id="parentId"
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">— None (This is a Parent) —</option>
                  {ingredients.filter(i => !i.parentId).map((ing) => (
                    <option key={ing.id} value={ing.id}>{ing.name}</option>
                  ))}
                </select>
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

              <div className="space-y-2">
                <Label htmlFor="costPerUnit">
                  {copy.costPer} {formData.unit} (IQD) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="costPerUnit"
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={formData.costPerUnit}
                  onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                  placeholder={copy.costPlaceholder}
                />
                <p className="text-xs text-slate-500">{copy.greater}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier">{copy.supplier}</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder={copy.abc}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 space-y-4 bg-slate-50/50">
              <div className="flex items-center gap-2 text-slate-900 font-semibold">
                <Calculator className="h-4 w-4" />
                <h3>Packaging & Purchase Format</h3>
              </div>
              <p className="text-xs text-slate-500">Enter bulk purchase details to auto-calculate the cost per unit.</p>
              
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="purchaseFormat">Purchase Format</Label>
                  <Input
                    id="purchaseFormat"
                    value={formData.purchaseFormat}
                    onChange={(e) => setFormData({ ...formData, purchaseFormat: e.target.value })}
                    placeholder="e.g., 5kg bag, 6-pack"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packageSize">Package Size ({formData.unit})</Label>
                  <Input
                    id="packageSize"
                    type="number"
                    step="any"
                    value={formData.packageSize}
                    onChange={(e) => setFormData({ ...formData, packageSize: e.target.value })}
                    placeholder="e.g., 5000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchasePrice">Purchase Price (IQD)</Label>
                  <Input
                    id="purchasePrice"
                    type="number"
                    step="any"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    placeholder="e.g., 25000"
                  />
                </div>
              </div>
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
