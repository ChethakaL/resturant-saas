'use client'

import { useEffect, useState, useRef, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Link2, Loader2, CheckCircle, Sparkles, ImagePlus, Check, Trash2, ChevronDown, ChevronUp, X, AlertCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  imageOrientationOptions,
  imageSizeOptions,
  type ImageOrientation,
  type ImageSizePreset,
} from '@/lib/image-format'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Category, Ingredient } from '@prisma/client'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n'

interface ExtractedMenuItem {
  name: string
  description: string
  price: number
  calories?: number | null
  tags: string[]
  verified: boolean
  imageUrl?: string
  categoryId?: string
  categoryName?: string
}

interface ImportByDigitalMenuProps {
  categories: Category[]
  ingredients: Ingredient[]
  defaultBackgroundPrompt?: string | null
}

function matchCategoryId(categories: Category[], categoryName?: string): string | undefined {
  if (!categoryName) return undefined
  const normalized = categoryName.trim().toLowerCase()
  const match = categories.find(
    (c) => {
      const name = c.name.trim().toLowerCase()
      return name === normalized || name.includes(normalized) || normalized.includes(name)
    }
  )
  return match?.id
}

function normalizeText(value?: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizeCategoryName(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

export default function ImportByDigitalMenu({ categories, ingredients, defaultBackgroundPrompt }: ImportByDigitalMenuProps) {
  const { toast } = useToast()
  const { t } = useI18n()
  const [availableCategories, setAvailableCategories] = useState<Category[]>(categories)
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'url' | 'extracting' | 'verifying' | 'complete'>('url')
  const [menuUrl, setMenuUrl] = useState('')
  const [extractedItems, setExtractedItems] = useState<ExtractedMenuItem[]>([])
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [editingItem, setEditingItem] = useState<ExtractedMenuItem | null>(null)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [imageOrientation, setImageOrientation] = useState<ImageOrientation>('landscape')
  const [imageSizePreset, setImageSizePreset] = useState<ImageSizePreset>('medium')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const formUploadRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setAvailableCategories(categories)
  }, [categories])

  const ensureCategoriesAndAssign = async (items: ExtractedMenuItem[]): Promise<ExtractedMenuItem[]> => {
    let nextCategories = [...availableCategories]
    const names: string[] = []
    const seen = new Set<string>()
    for (const item of items) {
      const cleaned = normalizeCategoryName(item.categoryName)
      const normalized = normalizeText(cleaned)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      names.push(cleaned)
    }

    if (names.length > 0) {
      let existing = new Set(nextCategories.map((c) => normalizeText(c.name)))
      let missing = names.filter((name) => !existing.has(normalizeText(name)))
      if (missing.length > 0) {
        const refresh = await fetch('/api/categories')
        if (refresh.ok) {
          const refreshed = await refresh.json()
          if (Array.isArray(refreshed)) {
            nextCategories = refreshed as Category[]
            setAvailableCategories(nextCategories)
          }
        }
      }

      existing = new Set(nextCategories.map((c) => normalizeText(c.name)))
      missing = names.filter((name) => !existing.has(normalizeText(name)))
      if (missing.length > 0) {
        let nextOrder =
          nextCategories.reduce((max, c) => (c.displayOrder > max ? c.displayOrder : max), -1) + 1
        for (const name of missing) {
          const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              description: 'Auto-created from menu import',
              displayOrder: nextOrder,
            }),
          })
          if (res.ok) {
            const created = (await res.json()) as Category
            nextCategories = [...nextCategories, created]
            nextOrder += 1
          }
        }

        const finalRefresh = await fetch('/api/categories')
        if (finalRefresh.ok) {
          const refreshed = await finalRefresh.json()
          if (Array.isArray(refreshed)) nextCategories = refreshed as Category[]
        }
        setAvailableCategories(nextCategories)
      }
    }

    return items.map((item) => ({
      ...item,
      categoryId: item.categoryId || matchCategoryId(nextCategories, item.categoryName),
    }))
  }

  // --- Bulk verification helpers ---

  const updateItem = (index: number, updates: Partial<ExtractedMenuItem>) => {
    setExtractedItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item))
  }

  const deleteItem = (index: number) => {
    setExtractedItems(prev => prev.filter((_, i) => i !== index))
    if (expandedIndex === index) {
      setExpandedIndex(null)
      setEditingItem(null)
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1)
    }
  }

  const toggleExpand = (index: number) => {
    if (expandedIndex === index) {
      // Collapse — sync editingItem back
      if (editingItem) {
        setExtractedItems(prev => prev.map((item, i) => i === expandedIndex ? { ...editingItem } : item))
      }
      setExpandedIndex(null)
      setEditingItem(null)
    } else {
      // Collapse previous if open, then expand new
      if (expandedIndex !== null && editingItem) {
        setExtractedItems(prev => prev.map((item, i) => i === expandedIndex ? { ...editingItem } : item))
      }
      setExpandedIndex(index)
      setEditingItem({ ...extractedItems[index] })
    }
  }

  const assignCategoryToUncategorized = (categoryId: string) => {
    let count = 0
    setExtractedItems(prev => prev.map(item => {
      if (!item.categoryId) {
        count++
        return { ...item, categoryId }
      }
      return item
    }))
    if (count > 0) {
      const catName = availableCategories.find(c => c.id === categoryId)?.name
      toast({ title: 'Category assigned', description: `Applied "${catName}" to ${count} uncategorized item${count > 1 ? 's' : ''}.` })
    }
  }

  const itemsWithoutCategory = extractedItems.filter(i => !i.categoryId).length
  const itemsWithIssues = extractedItems.filter(i => !i.categoryId || !i.name.trim() || !i.price || i.price <= 0).length

  // --- Image dialog helpers (unchanged) ---

  const openImageDialog = () => {
    setPreviewImageUrl(null)
    setCustomPrompt('')
    const current = editingItem?.imageUrl
    if (current && current.startsWith('data:')) {
      setUploadedPhoto(current)
    } else {
      setUploadedPhoto(null)
    }
    setShowImageDialog(true)
  }

  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setUploadedPhoto(reader.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // --- Scrape & extract ---

  const scrapeAndExtract = async () => {
    const url = menuUrl.trim()
    if (!url) {
      toast({ title: 'Enter a URL', description: 'Paste the public menu link', variant: 'destructive' })
      return
    }

    try {
      new URL(url)
    } catch {
      toast({ title: 'Invalid URL', description: 'Please enter a valid link', variant: 'destructive' })
      return
    }

    setIsProcessing(true)
    setStep('extracting')

    try {
      const response = await fetch('/api/menu/import-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          categoryNames: availableCategories.map((c) => c.name),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to import from URL')
      }

      const extracted: ExtractedMenuItem[] = (data.items || []).map((item: any) => ({
        ...item,
        categoryId: item.categoryId || matchCategoryId(availableCategories, item.categoryName),
      }))
      const items = await ensureCategoriesAndAssign(extracted)

      setExtractedItems(items)
      if (items.length > 0) {
        setStep('verifying')
      }
    } catch (error) {
      console.error('Import from URL error:', error)
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to import menu from URL',
        variant: 'destructive',
      })
      setStep('url')
    } finally {
      setIsProcessing(false)
    }
  }

  // --- AI image generation (unchanged) ---

  const generateOrEnhanceImage = async () => {
    if (!editingItem) return

    setIsGeneratingImage(true)
    setPreviewImageUrl(null)
    try {
      if (uploadedPhoto) {
        const response = await fetch('/api/menu/enhance-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: uploadedPhoto,
            prompt: customPrompt.trim() || defaultBackgroundPrompt?.trim() || undefined,
            orientation: imageOrientation,
            sizePreset: imageSizePreset,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to enhance image')
        setPreviewImageUrl(data.imageUrl)
        toast({ title: 'Image enhanced', description: 'Your photo has been professionally enhanced.' })
      } else {
        const response = await fetch('/api/menu/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemName: editingItem.name,
            description: editingItem.description,
            category: availableCategories.find((c) => c.id === editingItem.categoryId)?.name,
            orientation: imageOrientation,
            sizePreset: imageSizePreset,
            prompt: customPrompt.trim() || defaultBackgroundPrompt?.trim() || null,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to generate image')
        setPreviewImageUrl(data.imageUrl)
      }
    } catch (error) {
      toast({
        title: uploadedPhoto ? 'Enhancement Failed' : 'Image Generation Failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const trimmedSavedBackgroundPrompt = (defaultBackgroundPrompt ?? '').trim()
  const currentOrientationOption =
    imageOrientationOptions.find((o) => o.value === imageOrientation) ?? imageOrientationOptions[0]
  const currentSizeOption =
    imageSizeOptions.find((o) => o.value === imageSizePreset) ?? imageSizeOptions[1]

  // --- Create all items ---

  const handleCreateAll = async () => {
    let itemsToValidate = extractedItems

    // Sync expanded item back first
    if (expandedIndex !== null && editingItem) {
      itemsToValidate = extractedItems.map((item, i) => i === expandedIndex ? { ...editingItem } : item)
      setExtractedItems(itemsToValidate)
      setExpandedIndex(null)
      setEditingItem(null)
    }

    itemsToValidate = await ensureCategoriesAndAssign(itemsToValidate)
    setExtractedItems(itemsToValidate)

    const issues: string[] = []
    itemsToValidate.forEach((item, i) => {
      if (!item.name.trim()) issues.push(`Item ${i + 1}: Missing name`)
      if (!item.price || item.price <= 0) issues.push(`${item.name || `Item ${i + 1}`}: Invalid price`)
      if (!item.categoryId) issues.push(`${item.name || `Item ${i + 1}`}: No category`)
    })
    if (issues.length > 0) {
      toast({
        title: `${issues.length} issue${issues.length > 1 ? 's' : ''} found`,
        description: issues.length <= 3 ? issues.join('. ') : `${issues.slice(0, 3).join('. ')} and ${issues.length - 3} more.`,
        variant: 'destructive',
      })
      return
    }
    await createAllItems(itemsToValidate)
  }

  const createAllItems = async (items: ExtractedMenuItem[]) => {
    setIsProcessing(true)
    try {
      const errors: string[] = []
      for (const item of items) {
        if (!item.categoryId) {
          errors.push(`${item.name}: Missing category`)
          continue
        }
        const response = await fetch('/api/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.name,
            description: item.description || '',
            price: Number(item.price) || 0,
            categoryId: item.categoryId,
            imageUrl: item.imageUrl || '',
            calories: item.calories ? Number(item.calories) : null,
            tags: item.tags || [],
            available: true,
            ingredients: [],
          }),
        })
        if (!response.ok) {
          const data = await response.json()
          errors.push(`${item.name}: ${data.error || 'Failed to create'}`)
        }
      }

      if (errors.length > 0) {
        toast({
          title: 'Partial Success',
          description: `Created ${items.length - errors.length} of ${items.length} items. Some failed.`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Success',
          description: `Created ${items.length} menu items successfully!`,
        })
      }
      setStep('complete')
      setTimeout(() => {
        setIsOpen(false)
        window.location.reload()
      }, 2000)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create menu items',
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const resetModal = () => {
    setStep('url')
    setMenuUrl('')
    setExtractedItems([])
    setExpandedIndex(null)
    setEditingItem(null)
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setIsOpen(true); resetModal(); }}>
        <Link2 className="h-4 w-4 mr-2" />
        {t.menu_import_digital}
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetModal(); setIsOpen(open); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Import Menu from Digital Menu Link</DialogTitle>
            <DialogDescription>
              Paste a public link to a menu page (e.g. your website or a PDF menu). We&apos;ll scrape the page and extract menu items.
            </DialogDescription>
          </DialogHeader>

          {step === 'url' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="menu-url">Public menu URL</Label>
                <Input
                  id="menu-url"
                  type="url"
                  placeholder="https://example.com/menu"
                  value={menuUrl}
                  onChange={(e) => setMenuUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && scrapeAndExtract()}
                />
              </div>
              <Button onClick={scrapeAndExtract} className="w-full" disabled={!menuUrl.trim()}>
                Scrape & Extract Menu Items
              </Button>
            </div>
          )}

          {step === 'extracting' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-16 w-16 animate-spin text-emerald-500" />
              <p className="text-lg font-medium">Opening link and extracting menu...</p>
              <p className="text-sm text-slate-500">This may take a moment</p>
            </div>
          )}

          {step === 'verifying' && extractedItems.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Top summary bar */}
              <div className="shrink-0 space-y-3 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      {extractedItems.length} item{extractedItems.length !== 1 ? 's' : ''} extracted
                    </p>
                    {itemsWithoutCategory > 0 && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {itemsWithoutCategory} item{itemsWithoutCategory !== 1 ? 's' : ''} missing a category
                      </p>
                    )}
                  </div>
                  {itemsWithoutCategory > 0 && (
                    <Select onValueChange={assignCategoryToUncategorized}>
                      <SelectTrigger className="w-full sm:w-[220px] text-xs h-9 bg-white">
                        <SelectValue placeholder={`Set category for ${itemsWithoutCategory} uncategorized`} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Scrollable item list */}
              <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1">
                {extractedItems.map((item, index) => {
                  const isExpanded = expandedIndex === index
                  const hasIssues = !item.categoryId || !item.name.trim() || !item.price || item.price <= 0
                  const categoryName = availableCategories.find(c => c.id === item.categoryId)?.name

                  return (
                    <div
                      key={index}
                      className={`border rounded-lg transition-all ${hasIssues
                          ? 'border-amber-300 bg-amber-50/30'
                          : 'border-slate-200 bg-white'
                        }`}
                    >
                      {/* Compact row */}
                      <div className="flex items-start gap-3 p-3">
                        {/* Item number */}
                        <span className="text-xs font-medium text-slate-400 mt-1 w-6 text-right shrink-0">
                          {index + 1}
                        </span>

                        {/* Item info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {item.name || <span className="text-red-400 italic">Unnamed item</span>}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span className="text-xs font-medium text-slate-600">
                              IQD {(item.price || 0).toLocaleString()}
                            </span>
                            {categoryName ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                                {categoryName}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                                <AlertCircle className="h-2.5 w-2.5" />
                                No category
                              </span>
                            )}
                            {item.tags?.length > 0 && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                {item.tags.slice(0, 3).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Inline category select (quick fix) */}
                        <Select
                          value={item.categoryId || ''}
                          onValueChange={(v) => updateItem(index, { categoryId: v })}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs shrink-0 bg-white hidden sm:flex">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableCategories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => toggleExpand(index)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-red-50"
                            onClick={() => deleteItem(index)}
                          >
                            <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded edit form */}
                      {isExpanded && editingItem && (
                        <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50/50">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs">Item Name</Label>
                              <Input
                                value={editingItem.name}
                                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                className="bg-white"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Price (IQD)</Label>
                              <Input
                                type="number"
                                value={editingItem.price}
                                onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) })}
                                className="bg-white"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs">Description</Label>
                            <Textarea
                              value={editingItem.description}
                              onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                              rows={2}
                              className="bg-white"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs">Category</Label>
                              <Select
                                value={editingItem.categoryId}
                                onValueChange={(value) => setEditingItem({ ...editingItem, categoryId: value })}
                              >
                                <SelectTrigger className="bg-white">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableCategories.map((category) => (
                                    <SelectItem key={category.id} value={category.id}>
                                      {category.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Calories (optional)</Label>
                              <Input
                                type="number"
                                value={editingItem.calories ?? ''}
                                onChange={(e) => setEditingItem({ ...editingItem, calories: parseInt(e.target.value) || undefined })}
                                className="bg-white"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Tags (comma-separated)</Label>
                              <Input
                                value={(editingItem.tags || []).join(', ')}
                                onChange={(e) => setEditingItem({ ...editingItem, tags: e.target.value.split(',').map((t) => t.trim()) })}
                                placeholder="halal, spicy"
                                className="bg-white"
                              />
                            </div>
                          </div>

                          {/* Image section */}
                          <div className="space-y-2">
                            <Label className="text-xs">Image (optional)</Label>
                            <div className="flex gap-2 flex-wrap">
                              <Input
                                value={editingItem.imageUrl?.startsWith('http') ? editingItem.imageUrl : ''}
                                onChange={(e) => {
                                  const v = e.target.value.trim()
                                  setEditingItem({ ...editingItem, imageUrl: v || undefined })
                                }}
                                placeholder="https://example.com/image.jpg"
                                className="flex-1 min-w-[180px] bg-white"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => formUploadRef.current?.click()}
                              >
                                <ImagePlus className="h-4 w-4 mr-1" />
                                Upload
                              </Button>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                ref={formUploadRef}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  const reader = new FileReader()
                                  reader.onloadend = () => {
                                    setEditingItem({ ...editingItem, imageUrl: reader.result as string })
                                  }
                                  reader.readAsDataURL(file)
                                  e.target.value = ''
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={openImageDialog}
                                disabled={isGeneratingImage}
                              >
                                <Sparkles className="h-4 w-4 mr-1" />
                                AI Generate
                              </Button>
                            </div>
                            {editingItem.imageUrl && (
                              <div className="border rounded-lg overflow-auto bg-white flex items-start justify-center min-h-[80px] max-h-[200px]">
                                <img
                                  src={editingItem.imageUrl}
                                  alt={editingItem.name}
                                  className="max-w-full w-auto max-h-[190px] object-contain"
                                  onError={(e) => {
                                    e.currentTarget.src = ''
                                    setEditingItem({ ...editingItem, imageUrl: undefined })
                                  }}
                                />
                              </div>
                            )}
                          </div>

                          <div className="flex justify-end pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleExpand(index)}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Done Editing
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Sticky footer */}
              <div className="shrink-0 border-t border-slate-200 pt-4 mt-4 flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setStep('url'); setExpandedIndex(null); setEditingItem(null); }}
                  className="sm:w-auto"
                >
                  Back
                </Button>
                <Button
                  onClick={handleCreateAll}
                  className="flex-1"
                  disabled={isProcessing || extractedItems.length === 0}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating {extractedItems.length} items...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Create All {extractedItems.length} Item{extractedItems.length !== 1 ? 's' : ''}
                      {itemsWithIssues > 0 && (
                        <span className="ml-2 text-xs bg-white/20 rounded-full px-2 py-0.5">
                          {itemsWithIssues} need attention
                        </span>
                      )}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 'verifying' && extractedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <p className="text-sm text-slate-500">No items were extracted from this URL.</p>
              <Button variant="outline" onClick={() => setStep('url')}>Try Another URL</Button>
            </div>
          )}

          {step === 'complete' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-lg font-medium">All menu items created successfully!</p>
              <p className="text-sm text-slate-500">Redirecting...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Image dialog */}
      <Dialog
        open={showImageDialog}
        onOpenChange={(open) => {
          setShowImageDialog(open)
          if (!open) {
            setUploadedPhoto(null)
            setCustomPrompt('')
            setPreviewImageUrl(null)
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              Generate Image with AI
            </DialogTitle>
            <DialogDescription>
              Upload your own photo for professional enhancement, or generate a new image from scratch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto min-h-0 flex-1">
            {isGeneratingImage ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
                <p className="text-sm text-slate-500">
                  {uploadedPhoto ? 'Enhancing your photo professionally...' : 'Generating your image with AI...'}
                </p>
                <p className="text-xs text-slate-400">This may take a few moments</p>
              </div>
            ) : previewImageUrl ? (
              <div className="space-y-4">
                <Label>Image Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <img src={previewImageUrl} alt="Generated preview" className="w-full h-auto" />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    className="flex-1"
                    onClick={() => {
                      if (editingItem && expandedIndex !== null) {
                        setEditingItem({ ...editingItem, imageUrl: previewImageUrl })
                        setExtractedItems(prev =>
                          prev.map((item, i) => i === expandedIndex ? { ...item, imageUrl: previewImageUrl } : item)
                        )
                      }
                      setShowImageDialog(false)
                      setPreviewImageUrl(null)
                      setUploadedPhoto(null)
                      setCustomPrompt('')
                    }}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Use This Image
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPreviewImageUrl(null)}>
                    Try Again
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Upload Photo Section */}
                <div className="space-y-2">
                  <Label>Upload Your Photo (Recommended)</Label>
                  <p className="text-xs text-slate-500">
                    Upload a photo of your actual dish and our AI will enhance it to look professionally shot.
                    This helps customers see exactly what they&apos;ll receive!
                  </p>
                  <div className="flex gap-2 items-center">
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <ImagePlus className="h-4 w-4 mr-2" />
                      Select Photo
                    </Button>
                    {uploadedPhoto && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setUploadedPhoto(null)}>
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                  />
                  {uploadedPhoto && (
                    <div className="mt-2 rounded-lg border-2 border-emerald-500/50 overflow-hidden">
                      <img src={uploadedPhoto} alt="Uploaded preview" className="w-full h-48 object-cover" />
                      <div className="px-3 py-2 bg-emerald-500/10 text-xs text-emerald-700 flex items-center gap-2">
                        <Check className="h-3 w-3" />
                        Photo ready for AI enhancement
                      </div>
                    </div>
                  )}
                </div>

                {!uploadedPhoto && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-slate-500">or generate from scratch</span>
                    </div>
                  </div>
                )}

                {/* Custom Prompt */}
                <div className="space-y-2">
                  <Label htmlFor="import-custom-prompt">Custom Prompt (optional)</Label>
                  <Textarea
                    id="import-custom-prompt"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Describe subtle adjustments or recreate the scene from scratch..."
                    rows={3}
                    disabled={isGeneratingImage}
                  />
                  {trimmedSavedBackgroundPrompt && (
                    <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                      <p className="leading-relaxed">
                        Default background prompt ready. Apply it to speed up every menu image.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCustomPrompt(trimmedSavedBackgroundPrompt)}
                        disabled={isGeneratingImage}
                        className="rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-600"
                      >
                        Use default prompt
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    {uploadedPhoto
                      ? 'Tell us how to tweak the uploaded photo (lighting, crop, mood, minor edits).'
                      : 'Leave blank to auto-generate based on item name, category, and description.'}
                  </p>
                </div>

                {/* Orientation & Target size */}
                <div className="space-y-3 border-t border-dashed border-slate-200 pt-3">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      Orientation
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {imageOrientationOptions.map((option) => {
                        const isActive = option.value === imageOrientation
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setImageOrientation(option.value)}
                            className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${isActive
                                ? 'border-emerald-500 bg-emerald-100 text-slate-900'
                                : 'border-slate-200 bg-white/5 text-slate-500 hover:border-slate-400'
                              }`}
                          >
                            <span className="block text-sm">{option.label}</span>
                            <span className="text-[10px] text-slate-400">{option.aspect}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-slate-500 italic">
                      {currentOrientationOption.description}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      Target size
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {imageSizeOptions.map((option) => {
                        const isActive = option.value === imageSizePreset
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setImageSizePreset(option.value)}
                            className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${isActive
                                ? 'border-emerald-500 bg-emerald-100 text-slate-900'
                                : 'border-slate-200 bg-white/5 text-slate-400 hover:border-slate-400'
                              }`}
                          >
                            <span className="block text-sm">{option.label}</span>
                            <span className="text-[10px] text-slate-400">{`${option.pixels}px`}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-slate-500 italic">
                      {currentSizeOption.description}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          {!isGeneratingImage && !previewImageUrl && (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowImageDialog(false)
                  setUploadedPhoto(null)
                  setCustomPrompt('')
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={generateOrEnhanceImage} disabled={!editingItem}>
                <Sparkles className="h-4 w-4 mr-2" />
                {uploadedPhoto ? 'Enhance Photo' : 'Generate Image'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
