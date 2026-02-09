'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Link2, Loader2, CheckCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
}

function matchCategoryId(categories: Category[], categoryName?: string): string | undefined {
  if (!categoryName) return undefined
  const normalized = categoryName.trim().toLowerCase()
  const match = categories.find(
    (c) => c.name.trim().toLowerCase() === normalized
  )
  return match?.id
}

export default function ImportByDigitalMenu({ categories, ingredients }: ImportByDigitalMenuProps) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'url' | 'extracting' | 'verifying' | 'complete'>('url')
  const [menuUrl, setMenuUrl] = useState('')
  const [extractedItems, setExtractedItems] = useState<ExtractedMenuItem[]>([])
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [editingItem, setEditingItem] = useState<ExtractedMenuItem | null>(null)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)

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

  const generateImageForItem = async () => {
    if (!editingItem) return

    setIsGeneratingImage(true)
    try {
      const response = await fetch('/api/menu/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: editingItem.name,
          description: editingItem.description,
          category: categories.find((c) => c.id === editingItem.categoryId)?.name,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to generate image')
      setEditingItem({ ...editingItem, imageUrl: data.imageUrl })
    } catch (error) {
      toast({
        title: 'Image Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate image',
        variant: 'destructive',
      })
    } finally {
      setIsGeneratingImage(false)
    }
  }

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
            <div className="space-y-4 py-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-sm text-emerald-800">
                  Verifying item {currentItemIndex + 1} of {extractedItems.length}
                </p>
              </div>

              <div className="grid gap-4">
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
                  <div className="flex items-center justify-between">
                    <Label>Image</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateImageForItem}
                      disabled={isGeneratingImage}
                    >
                      {isGeneratingImage ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        'Generate with AI'
                      )}
                    </Button>
                  </div>
                  {editingItem.imageUrl && (
                    <div className="border rounded-lg overflow-hidden">
                      <img src={editingItem.imageUrl} alt={editingItem.name} className="w-full h-48 object-cover" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
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
    </>
  )
}
