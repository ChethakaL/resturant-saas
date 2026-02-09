'use client'

import { useState, useRef, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Link2, Loader2, CheckCircle, Sparkles, ImagePlus, Check, Trash2 } from 'lucide-react'
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
    (c) => c.name.trim().toLowerCase() === normalized
  )
  return match?.id
}

export default function ImportByDigitalMenu({ categories, ingredients, defaultBackgroundPrompt }: ImportByDigitalMenuProps) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'url' | 'extracting' | 'verifying' | 'complete'>('url')
  const [menuUrl, setMenuUrl] = useState('')
  const [extractedItems, setExtractedItems] = useState<ExtractedMenuItem[]>([])
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
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
          categoryNames: categories.map((c) => c.name),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to import from URL')
      }

      const items: ExtractedMenuItem[] = (data.items || []).map((item: any) => ({
        ...item,
        categoryId: item.categoryId || matchCategoryId(categories, item.categoryName),
      }))

      setExtractedItems(items)
      if (items.length > 0) {
        setStep('verifying')
        setEditingItem({ ...items[0] })
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
            category: categories.find((c) => c.id === editingItem.categoryId)?.name,
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

  const verifyAndNext = async () => {
    if (!editingItem) return

    if (!editingItem.categoryId) {
      toast({ title: 'Missing Category', description: 'Please select a category for this item', variant: 'destructive' })
      return
    }
    if (!editingItem.name.trim()) {
      toast({ title: 'Missing Name', description: 'Please enter a name for this item', variant: 'destructive' })
      return
    }
    if (!editingItem.price || editingItem.price <= 0) {
      toast({ title: 'Invalid Price', description: 'Please enter a valid price for this item', variant: 'destructive' })
      return
    }

    const updatedItems = [...extractedItems]
    updatedItems[currentItemIndex] = { ...editingItem, verified: true }
    setExtractedItems(updatedItems)

    if (currentItemIndex < extractedItems.length - 1) {
      setCurrentItemIndex(currentItemIndex + 1)
      setEditingItem({ ...updatedItems[currentItemIndex + 1] })
    } else {
      await createAllItems(updatedItems)
    }
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
    setCurrentItemIndex(0)
    setEditingItem(null)
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setIsOpen(true); resetModal(); }}>
        <Link2 className="h-4 w-4 mr-2" />
        Import by Digital Menu
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetModal(); setIsOpen(open); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Menu from Digital Menu Link</DialogTitle>
            <DialogDescription>
              Paste a public link to a menu page (e.g. your website or a PDF menu). We’ll scrape the page and extract menu items.
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

          {step === 'verifying' && editingItem && (
            <div className="flex flex-col max-h-[85vh] py-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 shrink-0">
                <p className="text-sm text-emerald-800">
                  Verifying item {currentItemIndex + 1} of {extractedItems.length}
                </p>
              </div>

              <div className="grid gap-4 overflow-y-auto flex-1 min-h-0 pr-2 mt-4">
                <div className="space-y-2">
                  <Label>Item Name</Label>
                  <Input
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Price (IQD)</Label>
                    <Input
                      type="number"
                      value={editingItem.price}
                      onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={editingItem.categoryId}
                      onValueChange={(value) => setEditingItem({ ...editingItem, categoryId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Calories (optional)</Label>
                  <Input
                    type="number"
                    value={editingItem.calories ?? ''}
                    onChange={(e) => setEditingItem({ ...editingItem, calories: parseInt(e.target.value) || undefined })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dietary Tags (comma-separated)</Label>
                  <Input
                    value={(editingItem.tags || []).join(', ')}
                    onChange={(e) => setEditingItem({ ...editingItem, tags: e.target.value.split(',').map((t) => t.trim()) })}
                    placeholder="e.g. vegan, spicy, gluten-free"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Image (optional)</Label>
                  <p className="text-xs text-slate-500">
                    Paste a URL, upload a photo, or generate with AI (upload + AI = enhance / regenerate background).
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Input
                      value={editingItem.imageUrl?.startsWith('http') ? editingItem.imageUrl : ''}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        setEditingItem({ ...editingItem, imageUrl: v || undefined })
                      }}
                      placeholder="https://example.com/image.jpg"
                      className="flex-1 min-w-[180px]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => formUploadRef.current?.click()}
                    >
                      <ImagePlus className="h-4 w-4 mr-2" />
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
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate with AI
                    </Button>
                  </div>
                  {editingItem.imageUrl && (
                    <div className="border rounded-lg overflow-auto bg-slate-50 flex items-start justify-center min-h-[120px] max-h-[320px]">
                      <img
                        src={editingItem.imageUrl}
                        alt={editingItem.name}
                        className="max-w-full w-auto max-h-[300px] object-contain"
                        onError={(e) => {
                          e.currentTarget.src = ''
                          setEditingItem({ ...editingItem, imageUrl: undefined })
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4 shrink-0 border-t pt-4 mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (currentItemIndex > 0) {
                      setCurrentItemIndex(currentItemIndex - 1)
                      setEditingItem({ ...extractedItems[currentItemIndex - 1] })
                    }
                  }}
                  disabled={currentItemIndex === 0}
                >
                  Previous
                </Button>
                <Button onClick={verifyAndNext} className="flex-1" disabled={isProcessing}>
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : currentItemIndex < extractedItems.length - 1 ? (
                    'Verify & Next'
                  ) : (
                    'Verify & Create All'
                  )}
                </Button>
              </div>
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

      {/* AI Image dialog: upload for enhancement or generate from scratch (same as Add Menu Item) */}
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
                      if (editingItem) setEditingItem({ ...editingItem, imageUrl: previewImageUrl })
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
                {/* Upload Photo Section - same as Add Menu Item */}
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

                {/* Custom Prompt - same as Add Menu Item */}
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

                {/* Orientation & Target size - same as Add Menu Item */}
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
                            className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                              isActive
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
                            className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                              isActive
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
