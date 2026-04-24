'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n, useDynamicTranslate } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface ReceiptItem {
  id: string
  name: string
  ingredientId?: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  brand?: string
  packageQuantity?: number
  packageUnit?: string
}

interface ProcessedReceiptItem {
  ingredientId: string
  ingredientName: string
  expenseId: string
  action: 'CREATED' | 'UPDATED'
}

interface ReceiptUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ingredientId?: string
}

export default function ReceiptUploadModal({
  open,
  onOpenChange,
  ingredientId,
}: ReceiptUploadModalProps) {
  const { t, locale } = useI18n()
  const { t: td } = useDynamicTranslate()
  const router = useRouter()

  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'success'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [extractedItems, setExtractedItems] = useState<ReceiptItem[]>([])
  const [supplier, setSupplier] = useState('')
  const [date, setDate] = useState('')
  const [totalAmount, setTotalAmount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [allIngredients, setAllIngredients] = useState<{ id: string; name: string; unit: string; brand?: string }[]>([])
  const [processedItems, setProcessedItems] = useState<ProcessedReceiptItem[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const sanitizeDraftIngredientName = (value: string) =>
    value
      .replace(/\b\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)*\b/gi, '')
      .replace(/[()\-_,]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()

  const normalizeForIngredientMatch = (value: string) => {
    const normalized = value
      .toLowerCase()
      .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|grams?|kilograms?|l|lt|liter|litre|liters|litres|ml|pcs?|pieces?)\b/g, ' ')
      .replace(/\b(?:bag|bags|box|boxes|pack|packs|bottle|bottles|can|cans|carton|cartons|jar|jars|block|blocks)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()

    return normalized
      .split(' ')
      .filter((token) => token.length > 1)
      .join(' ')
  }

  const getMatchTokens = (value: string) => normalizeForIngredientMatch(value).split(' ').filter(Boolean)

  const ingredientMatchScore = (receiptName: string, ingredientName: string, brand?: string) => {
    const receiptNormalized = normalizeForIngredientMatch(receiptName)
    const ingredientNormalized = normalizeForIngredientMatch(ingredientName)
    const brandNormalized = brand ? normalizeForIngredientMatch(brand) : ''

    if (!receiptNormalized || !ingredientNormalized) return 0
    if (receiptNormalized === ingredientNormalized) return 100
    if (receiptNormalized.includes(ingredientNormalized) || ingredientNormalized.includes(receiptNormalized)) return 90

    const receiptTokens = new Set(getMatchTokens(`${receiptName} ${brand ?? ''}`))
    const ingredientTokens = getMatchTokens(ingredientName)
    if (ingredientTokens.length === 0) return 0

    const matchedTokens = ingredientTokens.filter((token) => receiptTokens.has(token))
    const tokenScore = matchedTokens.length / ingredientTokens.length
    const brandScore = brandNormalized && ingredientNormalized.includes(brandNormalized) ? 0.25 : 0

    return tokenScore + brandScore
  }

  const findMatchingIngredient = (raw: any) => {
    const candidates = allIngredients
      .map((ingredient) => ({
        ingredient,
        score: ingredientMatchScore(String(raw.name || ''), ingredient.name, raw.brand),
      }))
      .filter((candidate) => candidate.score >= 0.6)
      .sort((left, right) => right.score - left.score)

    return candidates[0]?.ingredient ?? null
  }

  const extractPackageSize = (value: string) => {
    const match = value.match(/\b(\d+(?:\.\d+)?)\s*(?:pcs?|pieces?)\b/i)
    if (!match) return null

    const quantity = Number(match[1])
    if (!Number.isFinite(quantity) || quantity <= 1) return null

    return {
      packageQuantity: quantity,
      packageUnit: 'piece',
    }
  }

  useEffect(() => {
    if (open) {
      const fetchIngredients = async () => {
        try {
          const res = await fetch('/api/inventory', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          })
          if (res.ok) {
            const data = await res.json()

            setAllIngredients(data || [])
          }
        } catch (err) {
          console.error('Failed to load ingredients:', err)
        }
      }
      fetchIngredients()
    }
  }, [open])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    if (selected.size > 10 * 1024 * 1024) {
      setError(td('File too large (max 50MB)'))
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError(td('Only JPEG, PNG, WebP allowed'))
      return
    }

    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
    setError(null)
  }

  const handleUpload = async () => {
    if (!file) return

    setStep('processing')
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    if (ingredientId) formData.append('ingredientId', ingredientId)
    formData.append('managementLocale', locale)

    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || td('Failed to process receipt'))
      }

      const data = await res.json()
      setReceiptId(data.receiptId)

      const contextIngredient = ingredientId
        ? allIngredients.find((ingredient) => ingredient.id === ingredientId)
        : null

      const items = (data.extractedData?.items || []).map((raw: any, idx: number) => {
        const matched = findMatchingIngredient(raw)

        const normalizedRawName = String(raw.name || '').trim().toLowerCase()
        const contextMatchesCurrentIngredient =
          Boolean(contextIngredient) &&
          normalizedRawName.length > 0 &&
          (
            normalizeForIngredientMatch(contextIngredient!.name).includes(normalizeForIngredientMatch(normalizedRawName)) ||
            normalizeForIngredientMatch(normalizedRawName).includes(normalizeForIngredientMatch(contextIngredient!.name)) ||
            ingredientMatchScore(normalizedRawName, contextIngredient!.name, raw.brand) >= 0.6
          )

        const linkedIngredientId = matched?.id
          ? matched.id
          : (data.extractedData?.items || []).length === 1 || contextMatchesCurrentIngredient
            ? ingredientId || ''
            : ''

        const packageSize = extractPackageSize(raw.name || '')
        const quantity =
          typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1
        const unitPrice =
          typeof raw.unitPrice === 'number' && Number.isFinite(raw.unitPrice) ? raw.unitPrice : 0
        const totalPrice =
          typeof raw.totalPrice === 'number' && Number.isFinite(raw.totalPrice)
            ? raw.totalPrice
            : quantity * unitPrice

        return {
          id: `item-${idx}`,
          name: sanitizeDraftIngredientName(raw.name || 'Unknown') || raw.name || 'Unknown',
          quantity,
          unit: raw.unit || 'piece',
          unitPrice,
          totalPrice,
          brand: raw.brand,
          ...(packageSize ?? {}),
          ingredientId: linkedIngredientId,
        }
      })

      setExtractedItems(items)
      setSupplier(data.extractedData?.supplier || '')
      setDate(data.extractedData?.date || '')
      setTotalAmount(data.extractedData?.totalAmount || 0)

      setStep('review')
    } catch (err: any) {
      setError(err.message || td('An error occurred'))
      setStep('upload')
    }
  }

  const handleConfirm = async () => {
    if (!receiptId || extractedItems.length === 0) return

    setIsSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/receipts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId,
          items: extractedItems.map(item => ({
            ...item,
            supplier,
            date,
          })),
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || td('Failed to confirm receipt'))
      }

      const data = await res.json()
      setProcessedItems(Array.isArray(data.processedItems) ? data.processedItems : [])
      setStep('success')
      router.refresh()
    } catch (err: any) {
      setError(err.message || td('Failed to save changes'))
    } finally {
      setIsSaving(false)
    }
  }

  const updateItem = (id: string, updates: Partial<ReceiptItem>) => {
    setExtractedItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item))
    )
  }

  const updateNumericItemField = (
    id: string,
    field: 'quantity' | 'unitPrice' | 'totalPrice' | 'packageQuantity',
    value: string
  ) => {
    const parsed = Number(value)
    updateItem(id, {
      [field]: Number.isFinite(parsed) ? parsed : 0,
    } as Partial<ReceiptItem>)
  }

  const removeItem = (id: string) => {
    setExtractedItems(prev => prev.filter(item => item.id !== id))
  }

  const getReceiptItemTotals = (item: ReceiptItem) => {
    const packageQuantity =
      typeof item.packageQuantity === 'number' && item.packageQuantity > 0
        ? item.packageQuantity
        : null
    const packageUnit = item.packageUnit || 'piece'
    const totalUnits = packageQuantity ? item.quantity * packageQuantity : item.quantity
    const unitLabel = packageQuantity ? packageUnit : item.unit
    const costPerUnit = totalUnits > 0 ? item.totalPrice / totalUnits : 0
    const packagePrice = item.quantity > 0 ? item.totalPrice / item.quantity : item.totalPrice

    return {
      packageQuantity,
      packageUnit,
      totalUnits,
      unitLabel,
      costPerUnit,
      packagePrice,
    }
  }

  const resetModal = () => {
    setStep('upload')
    setFile(null)
    setPreviewUrl(null)
    setReceiptId(null)
    setExtractedItems([])
    setSupplier('')
    setDate('')
    setTotalAmount(0)
    setError(null)
    setProcessedItems([])
  }

  const closeModal = () => {
    resetModal()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            <Upload className="h-5 w-5 text-primary" />
            {td('Upload & Process Receipt')}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && td('Upload receipt image to extract purchases')}
            {step === 'review' && td('Review and link items to inventory')}
            {step === 'success' && td('Receipt successfully processed')}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg flex items-center gap-3 text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 'upload' && (
          <div className="py-8">
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
                file ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/30"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              {previewUrl ? (
                <div className="relative mx-auto max-w-sm aspect-[4/3] rounded-lg overflow-hidden border bg-background shadow-sm">
                  <Image
                    src={previewUrl}
                    alt="Receipt preview"
                    fill
                    className="object-contain"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-3 right-3"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                      setPreviewUrl(null)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">{td('Click or drag receipt here')}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {td('JPEG, PNG, WebP • max 10 MB')}
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {file && (
              <div className="flex justify-center mt-6">
                <Button onClick={handleUpload} size="lg" className="px-10">
                  {td('Process with AI')}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="py-24 flex flex-col items-center justify-center text-center space-y-5">
            <Loader2 className="h-14 w-14 text-primary animate-spin" />
            <h3 className="text-xl font-semibold">{td('Analyzing receipt...')}</h3>
            <p className="text-muted-foreground">{td('This usually takes 5–15 seconds')}</p>
          </div>
        )}

        {step === 'review' && (
          <div className="grid max-h-[calc(92vh-11rem)] gap-7 overflow-hidden py-4 md:grid-cols-[1.15fr_1fr]">
            {/* Left: Image Preview */}
            <div className="space-y-4">
              <h4 className="font-medium text-muted-foreground">{td('Receipt Image')}</h4>
              <div className="relative h-[calc(92vh-14rem)] min-h-[32rem] overflow-hidden rounded-lg border bg-muted/30 shadow-inner">
                {previewUrl && (
                  <Image
                    src={previewUrl}
                    alt="Receipt"
                    fill
                    className="object-contain p-1"
                  />
                )}
              </div>
            </div>

            {/* Right: Edit Form */}
            <div className="flex min-h-0 flex-col space-y-6 overflow-hidden">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplier">{td('Supplier')}</Label>
                  <Input
                    id="supplier"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder={td('e.g. Al-Anbar Market')}
                    dir="auto"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">{td('Date')}</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{td('Purchased Items')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {extractedItems.length} {td('item(s)')}
                  </p>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2 pb-6">
                  {extractedItems.map((item) => {
                    const totals = getReceiptItemTotals(item)

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "p-4 border rounded-lg space-y-3 transition-all",
                          item.ingredientId
                            ? "border-green-200 bg-green-50/40"
                            : "border-amber-200 bg-amber-50/40"
                        )}
                      >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5 md:col-span-2">
                              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                                {td('Ingredient Name')}
                              </Label>
                              <Input
                                value={item.name}
                                onChange={(e) => updateItem(item.id, { name: e.target.value })}
                                className="text-sm"
                                dir="auto"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                                {td('Brand')}
                              </Label>
                              <Input
                                value={item.brand || ''}
                                onChange={(e) => updateItem(item.id, { brand: e.target.value || undefined })}
                                className="text-sm"
                                dir="auto"
                                placeholder={td('Optional')}
                              />
                            </div>
                            <div className="grid gap-2 md:col-span-2 md:grid-cols-[0.9fr_0.9fr_1.15fr]">
                              <div className="space-y-1.5">
                                <Label className="flex min-h-[2rem] items-end text-xs uppercase tracking-wide text-muted-foreground">
                                  {totals.packageQuantity ? td('Packs bought') : td('Quantity')}
                                </Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.quantity}
                                  onChange={(e) => updateNumericItemField(item.id, 'quantity', e.target.value)}
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="flex min-h-[2rem] items-end text-xs uppercase tracking-wide text-muted-foreground">
                                  {totals.packageQuantity ? td('Purchase unit') : td('Unit')}
                                </Label>
                                <Input
                                  value={item.unit}
                                  onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                                  className="text-sm"
                                  dir="auto"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="flex min-h-[2rem] items-end text-xs uppercase tracking-wide text-muted-foreground">
                                  {td('Total line price')}
                                </Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.totalPrice}
                                  onChange={(e) => updateNumericItemField(item.id, 'totalPrice', e.target.value)}
                                  className="text-sm"
                                />
                              </div>
                            </div>
                            {totals.packageQuantity ? (
                              <div className="grid grid-cols-2 gap-2 md:col-span-2">
                                <div className="space-y-1.5">
                                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                                    {td('Pieces per pack')}
                                  </Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={item.packageQuantity ?? ''}
                                    onChange={(e) => updateNumericItemField(item.id, 'packageQuantity', e.target.value)}
                                    className="text-sm"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                                    {td('Package unit')}
                                  </Label>
                                  <Input
                                    value={item.packageUnit || 'piece'}
                                    onChange={(e) => updateItem(item.id, { packageUnit: e.target.value })}
                                    className="text-sm"
                                    dir="auto"
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="mt-3 rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700">
                            {totals.packageQuantity ? (
                              <>
                                <div>
                                  {item.quantity} {td('packs')} × {totals.packageQuantity} {totals.packageUnit}
                                  {' = '}
                                  <span className="font-medium">
                                    {totals.totalUnits.toLocaleString()} {totals.unitLabel}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500">
                                  {td('Package price')}: {Math.round(totals.packagePrice).toLocaleString()} IQD
                                  {' · '}
                                  {td('Cost per')} {totals.unitLabel}: {Math.round(totals.costPerUnit).toLocaleString()} IQD
                                </div>
                              </>
                            ) : (
                              <>
                                {item.quantity} × {item.unit} @ {item.unitPrice.toLocaleString()} IQD
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right font-medium">
                          {item.totalPrice.toLocaleString()} IQD
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-1 block">
                          {td('Link to Inventory')}
                        </Label>
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <Select
                              value={item.ingredientId || ''}
                              onValueChange={(val) =>
                                updateItem(item.id, { ingredientId: val || undefined })
                              }
                            >
                              <SelectTrigger className="text-sm">
                                <SelectValue placeholder={td('+ Add as New Ingredient')} />
                              </SelectTrigger>
                              <SelectContent>
                                {allIngredients.map(ing => (
                                  <SelectItem key={ing.id} value={ing.id}>
                                    {ing.name} {ing.brand ? `(${ing.brand})` : ''} – {ing.unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {item.ingredientId ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => updateItem(item.id, { ingredientId: undefined })}
                            >
                              {td('Clear')}
                            </Button>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {item.ingredientId
                            ? td('This receipt item will update the selected inventory ingredient.')
                            : td('Leave this unlinked to create a new inventory ingredient when you confirm.')}
                        </p>
                      </div>

                      {/* <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-destructive hover:text-destructive/80"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button> */}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-12 flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">{td('Success!')}</h3>
              <p className="text-muted-foreground mt-2 max-w-md">
                {td('Receipt processed. Inventory costs and stock updated, expense recorded.')}
              </p>
            </div>
            {processedItems.length > 0 ? (
              <div className="w-full max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-left shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_0_28px_rgba(16,185,129,0.18)]">
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-700">
                  {td('Added to inventory')}
                </p>
                <div className="space-y-3">
                  {processedItems.map((item) => (
                    <div
                      key={`${item.ingredientId}-${item.expenseId}`}
                      className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-white/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{item.ingredientName}</p>
                        <p className="text-sm text-slate-500">
                          {item.action === 'CREATED'
                            ? td('Created as a new inventory ingredient')
                            : td('Updated existing inventory ingredient')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-emerald-800 border-emerald-300"
                          onClick={() => {
                            onOpenChange(false)
                            router.push(
                              `/inventory?page=1&q=${encodeURIComponent(item.ingredientName)}`
                            )
                          }}
                        >
                          {td('View in inventory')}
                        </Button>
                        <span
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-semibold',
                            item.action === 'CREATED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-sky-100 text-sky-700'
                          )}
                        >
                          {item.action === 'CREATED' ? td('New') : td('Updated')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="sticky bottom-0 z-10 -mx-6 mt-4 gap-3 border-t bg-white px-6 py-4 sm:gap-4">
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={closeModal}>
                {t.common_cancel}
              </Button>
              {file && (
                <Button onClick={handleUpload} disabled={!file}>
                  {td('Process Receipt')}
                </Button>
              )}
            </>
          )}

          {step === 'review' && (
            <>
              <Button variant="outline" onClick={resetModal}>
                {td('Discard')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isSaving || extractedItems.length === 0}
                className="min-w-36 gap-2"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {td('Confirm & Save')}
              </Button>
            </>
          )}

          {step === 'success' && (
            <Button onClick={closeModal} className="w-full sm:w-auto">
              {t.common_done_editing || 'Done'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
