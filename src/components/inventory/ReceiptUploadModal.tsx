'use client'

import { useState, useRef, useEffect } from 'react'
import { useI18n, useDynamicTranslate } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

interface ReceiptItem {
  id?: string
  name: string
  ingredientId?: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  brand?: string
}

interface ReceiptUploadModalProps {
  isOpen: boolean
  onClose: () => void
  ingredientId?: string // Optional: if uploaded from a specific ingredient's edit screen
}

export default function ReceiptUploadModal({
  isOpen,
  onClose,
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
  const [ingredients, setIngredients] = useState<any[]>([])
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      const fetchIngredients = async () => {
        try {
          const res = await fetch('/api/inventory')
          if (res.ok) {
            const data = await res.json()
            setIngredients(data.ingredients || [])
          }
        } catch (err) {
          console.error('Failed to fetch ingredients:', err)
        }
      }
      fetchIngredients()
    }
  }, [isOpen])

  const findMatchingIngredient = (name: string) => {
    if (!name) return null
    const lowerName = name.toLowerCase()
    return ingredients.find(ing => 
      ing.name.toLowerCase() === lowerName || 
      lowerName.includes(ing.name.toLowerCase()) ||
      (ing.brand && lowerName.includes(ing.brand.toLowerCase()))
    )
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError(td('File too large (max 10MB)'))
        return
      }
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setStep('processing')
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    if (ingredientId) {
      formData.append('ingredientId', ingredientId)
    }

    try {
      const response = await fetch('/api/inventory/receipt/process', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || td('Failed to process receipt'))
      }

      const data = await response.json()
      setReceiptId(data.receiptId)
      
      const items = (data.extractedData.items || []).map((item: any, index: number) => {
        const matched = findMatchingIngredient(item.name)
        return {
          ...item,
          id: `item-${index}`,
          ingredientId: ingredientId || matched?.id || '',
        }
      })
      
      setExtractedItems(items)
      setSupplier(data.extractedData.supplier || '')
      setDate(data.extractedData.date || '')
      setTotalAmount(data.extractedData.totalAmount || 0)
      setStep('review')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : td('An unexpected error occurred'))
      setStep('upload')
    }
  }

  const handleConfirm = async () => {
    if (!receiptId) return
    setIsSaving(true)

    try {
      const response = await fetch('/api/inventory/receipt/confirm', {
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

      if (!response.ok) {
        throw new Error(td('Failed to confirm receipt'))
      }

      setStep('success')
      router.refresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : td('Failed to save data'))
    } finally {
      setIsSaving(false)
    }
  }

  const removeItem = (id: string) => {
    setExtractedItems(prev => prev.filter(item => item.id !== id))
  }

  const reset = () => {
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-600" />
            {td('Upload Receipt')}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {step === 'upload' && (
          <div className="space-y-6 py-4">
            {!file ? (
              <div 
                className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center hover:border-indigo-400 hover:bg-slate-50 transition-all cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900">{td('Click to upload image')}</h3>
                <p className="text-sm text-slate-500 mt-2">{td('PNG, JPG or WebP (max 10MB)')}</p>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-[4/3] w-full max-w-md mx-auto rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                  <Image 
                    src={previewUrl!} 
                    alt="Receipt preview" 
                    fill 
                    className="object-contain bg-slate-100" 
                  />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-2 right-2 h-8 w-8 rounded-full"
                    onClick={() => setFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex justify-center">
                  <Button onClick={handleUpload} className="px-8">
                    {td('Process with AI')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="py-20 text-center space-y-4">
            <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mx-auto" />
            <h3 className="text-xl font-semibold text-slate-900">{td('AI is reading your receipt...')}</h3>
            <p className="text-slate-500">{td('This usually takes 5-10 seconds')}</p>
          </div>
        )}

        {step === 'review' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                {td('Receipt Preview')}
              </h3>
              <div className="relative aspect-[3/4] w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                <Image 
                  src={previewUrl!} 
                  alt="Receipt preview" 
                  fill 
                  className="object-contain" 
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="supplier">{td('Supplier')}</Label>
                <Input 
                  id="supplier" 
                  value={supplier} 
                  onChange={(e) => setSupplier(e.target.value)} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">{td('Date')}</Label>
                  <Input 
                    id="date" 
                    type="date" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalAmount">{td('Total Amount')}</Label>
                  <Input 
                    id="totalAmount" 
                    type="number" 
                    value={totalAmount} 
                    onChange={(e) => setTotalAmount(parseFloat(e.target.value))} 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-700">{td('Extracted Ingredients')}</h4>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {extractedItems.map((item) => (
                    <div key={item.id} className={`p-4 border rounded-xl space-y-3 relative group bg-white shadow-sm transition-all hover:border-indigo-200 ${item.ingredientId ? 'border-green-100 ring-1 ring-green-50' : 'border-amber-100 ring-1 ring-amber-50'}`}>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute top-2 right-2 h-7 w-7 rounded-full bg-red-50 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeItem(item.id!)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{item.name}</span>
                            {item.ingredientId ? (
                              <div className="p-0.5 bg-green-100 rounded-full">
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              </div>
                            ) : (
                              <div className="p-0.5 bg-amber-100 rounded-full">
                                <AlertCircle className="h-3 w-3 text-amber-600" />
                              </div>
                            )}
                          </div>
                          {!item.ingredientId && (
                            <p className="text-[10px] text-amber-600 mt-1 font-semibold">
                              {td('New ingredient will be created')}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                              {item.quantity} {item.unit}
                            </span>
                            {item.brand && <span className="text-xs text-slate-400 italic">({item.brand})</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900">{item.totalPrice.toLocaleString()} {td('IQD')}</p>
                          <p className="text-[10px] text-slate-500 font-medium">@ {item.unitPrice.toLocaleString()} / {item.unit}</p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-50">
                        <Label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">
                          {td('Link to Inventory')}
                        </Label>
                        <select 
                          className="w-full text-sm rounded-md border border-slate-200 bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={item.ingredientId || ''}
                          onChange={(e) => {
                            const newId = e.target.value
                            setExtractedItems(prev => prev.map(i => 
                              i.id === item.id ? { ...i, ingredientId: newId } : i
                            ))
                          }}
                        >
                          <option value="">+ {td('Add as New Ingredient')}</option>
                          {ingredients.map(ing => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name} {ing.brand ? `(${ing.brand})` : ''} - {ing.stockQuantity} {ing.unit}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-12 text-center space-y-6">
            <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-900">{td('Receipt Processed!')}</h3>
              <p className="text-slate-500 max-w-sm mx-auto">
                {td('Ingredients have been added to inventory and costs updated correctly.')}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={reset}>
                {td('Discard')}
              </Button>
              <Button onClick={handleConfirm} disabled={isSaving || extractedItems.length === 0} className="gap-2 px-6">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {td('Apply Updates')}
              </Button>
            </>
          )}
          {step === 'success' && (
            <Button onClick={onClose} className="w-full sm:w-auto">
              {t.common_save}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
