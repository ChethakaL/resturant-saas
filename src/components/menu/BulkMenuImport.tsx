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
import { ImagePlus, Upload, Loader2, CheckCircle, XCircle } from 'lucide-react'
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

interface ExtractedMenuItem {
  name: string
  description: string
  price: number
  calories?: number
  tags: string[]
  verified: boolean
  imageUrl?: string
  categoryId?: string
}

interface BulkMenuImportProps {
  categories: Category[]
  ingredients: Ingredient[]
}

export default function BulkMenuImport({ categories, ingredients }: BulkMenuImportProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'upload' | 'extracting' | 'verifying' | 'complete'>('upload')
  const [menuImage, setMenuImage] = useState<string | null>(null)
  const [extractedItems, setExtractedItems] = useState<ExtractedMenuItem[]>([])
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [editingItem, setEditingItem] = useState<ExtractedMenuItem | null>(null)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [selectedIngredients, setSelectedIngredients] = useState<{ ingredientId: string; quantity: number }[]>([])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setMenuImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const extractMenuItems = async () => {
    if (!menuImage) return

    setIsProcessing(true)
    setStep('extracting')

    try {
      const response = await fetch('/api/menu/extract-from-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: menuImage }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract menu items')
      }

      setExtractedItems(data.items || [])
      if (data.items && data.items.length > 0) {
        setStep('verifying')
        setEditingItem({ ...data.items[0] })
      }
    } catch (error) {
      console.error('Error extracting menu items:', error)
      alert(error instanceof Error ? error.message : 'Failed to extract menu items')
      setStep('upload')
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

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image')
      }

      setEditingItem({ ...editingItem, imageUrl: data.imageUrl })
    } catch (error) {
      console.error('Error generating image:', error)
      alert(error instanceof Error ? error.message : 'Failed to generate image')
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const verifyAndNext = async () => {
    if (!editingItem) return

    // Update the item in the array
    const updatedItems = [...extractedItems]
    updatedItems[currentItemIndex] = { ...editingItem, verified: true }
    setExtractedItems(updatedItems)

    // Move to next item
    if (currentItemIndex < extractedItems.length - 1) {
      setCurrentItemIndex(currentItemIndex + 1)
      setEditingItem({ ...updatedItems[currentItemIndex + 1] })
      setSelectedIngredients([])
    } else {
      // All items verified, create them
      await createAllItems(updatedItems)
    }
  }

  const createAllItems = async (items: ExtractedMenuItem[]) => {
    setIsProcessing(true)

    try {
      for (const item of items) {
        await fetch('/api/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.name,
            description: item.description,
            price: item.price,
            categoryId: item.categoryId,
            imageUrl: item.imageUrl,
            calories: item.calories,
            tags: item.tags,
            available: true,
            ingredients: [],
          }),
        })
      }

      setStep('complete')
      setTimeout(() => {
        setIsOpen(false)
        window.location.reload()
      }, 2000)
    } catch (error) {
      console.error('Error creating menu items:', error)
      alert('Failed to create some menu items')
    } finally {
      setIsProcessing(false)
    }
  }

  const addIngredient = () => {
    setSelectedIngredients([...selectedIngredients, { ingredientId: '', quantity: 0 }])
  }

  const removeIngredient = (index: number) => {
    setSelectedIngredients(selectedIngredients.filter((_, i) => i !== index))
  }

  const updateIngredient = (index: number, field: 'ingredientId' | 'quantity', value: any) => {
    const updated = [...selectedIngredients]
    updated[index] = { ...updated[index], [field]: value }
    setSelectedIngredients(updated)
  }

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <ImagePlus className="h-4 w-4 mr-2" />
        Add Menu Items by Image
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Menu Items from Image</DialogTitle>
            <DialogDescription>
              Upload a photo of your menu and we'll extract all items automatically
            </DialogDescription>
          </DialogHeader>

          {step === 'upload' && (
            <div className="space-y-4 py-4">
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                <Label htmlFor="menu-image" className="cursor-pointer">
                  <div className="text-sm text-slate-600 mb-2">
                    Click to upload or drag and drop your menu image
                  </div>
                  <div className="text-xs text-slate-500">PNG, JPG up to 10MB</div>
                </Label>
                <Input
                  id="menu-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              {menuImage && (
                <div className="space-y-4">
                  <div className="border rounded-lg overflow-hidden">
                    <img src={menuImage} alt="Menu" className="w-full h-auto" />
                  </div>
                  <Button onClick={extractMenuItems} className="w-full">
                    Extract Menu Items
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === 'extracting' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-16 w-16 animate-spin text-emerald-500" />
              <p className="text-lg font-medium">Analyzing your menu...</p>
              <p className="text-sm text-slate-500">This may take a few moments</p>
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
                    value={editingItem.calories || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, calories: parseInt(e.target.value) || undefined })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Dietary Tags (comma-separated)</Label>
                  <Input
                    value={editingItem.tags.join(', ')}
                    onChange={(e) => setEditingItem({ ...editingItem, tags: e.target.value.split(',').map(t => t.trim()) })}
                    placeholder="e.g., vegan, spicy, gluten-free"
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
