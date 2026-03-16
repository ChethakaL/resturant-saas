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
  const { t } = useI18n()
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

  const fileInputRef = useRef<HTMLInputElement>(null)

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

      const items = (data.extractedData?.items || []).map((raw: any, idx: number) => {
        const matched = allIngredients.find(ing =>
          ing.name.toLowerCase().includes(raw.name.toLowerCase()) ||
          (raw.brand && ing.brand?.toLowerCase().includes(raw.brand.toLowerCase()))
        )

        return {
          id: `item-${idx}`,
          name: raw.name || 'Unknown',
          quantity: raw.quantity || 1,
          unit: raw.unit || 'piece',
          unitPrice: raw.unitPrice || 0,
          totalPrice: raw.totalPrice || 0,
          brand: raw.brand,
          ingredientId: ingredientId || matched?.id || '',
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

  const removeItem = (id: string) => {
    setExtractedItems(prev => prev.filter(item => item.id !== id))
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
  }

  const closeModal = () => {
    resetModal()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6">
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
          <div className="grid md:grid-cols-2 gap-7 py-4">
            {/* Left: Image Preview */}
            <div className="space-y-4">
              <h4 className="font-medium text-muted-foreground">{td('Receipt Image')}</h4>
              <div className="relative aspect-[3/4] rounded-lg overflow-hidden border bg-muted/30 shadow-inner">
                {previewUrl && (
                  <Image
                    src={previewUrl}
                    alt="Receipt"
                    fill
                    className="object-contain p-2"
                  />
                )}
              </div>
            </div>

            {/* Right: Edit Form */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplier">{td('Supplier')}</Label>
                  <Input
                    id="supplier"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder={td('e.g. Al-Anbar Market')}
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{td('Purchased Items')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {extractedItems.length} {td('item(s)')}
                  </p>
                </div>

                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
                  {extractedItems.map((item) => (
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.name}</span>
                            {item.brand && <span className="text-sm text-muted-foreground">({item.brand})</span>}
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5">
                            {item.quantity} × {item.unit} @ {item.unitPrice.toLocaleString()} IQD
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

                      {/* <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-destructive hover:text-destructive/80"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button> */}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-16 flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">{td('Success!')}</h3>
              <p className="text-muted-foreground mt-2 max-w-md">
                {td('Receipt processed. Inventory costs and stock updated, expense recorded.')}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-3 sm:gap-4 pt-4 border-t">
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
              {"done"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}