'use client'

import { useState, useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Plus, X } from 'lucide-react'
import DatePicker from '@/components/ui/date-picker'

interface MenuItem {
  id: string
  name: string
  price: number
}

interface Ingredient {
  id: string
  name: string
  unit: string
}

interface PrepItem {
  menuItemId: string
  quantityPrepped: number
}

interface CustomUsage {
  ingredientId: string
  quantityUsed: number
}

type MealPrepSession = {
  id: string
  prepDate: string
  sessionTime: string
  preparedBy?: string | null
  notes?: string | null
  prepItems: Array<{
    id: string
    menuItem: { id: string; name: string }
    quantityPrepped: number
  }>
  inventoryUsages: Array<{
    id: string
    ingredient: { id: string; name: string }
    quantityUsed: number
  }>
}

export default function CreatePrepSessionModal({
  open,
  onClose,
  initialData,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initialData?: MealPrepSession | null
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [prepItems, setPrepItems] = useState<PrepItem[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [useCustomUsage, setUseCustomUsage] = useState(false)
  const [customUsages, setCustomUsages] = useState<CustomUsage[]>([])
  const [formData, setFormData] = useState({
    prepDate: new Date().toISOString().split('T')[0],
    sessionTime: 'MORNING',
    preparedBy: '',
    notes: '',
  })

  useEffect(() => {
    if (open) {
      fetch('/api/menu')
        .then((res) => res.json())
        .then((data) => setMenuItems(data))
        .catch(console.error)
      fetch('/api/inventory')
        .then((res) => res.json())
        .then((data) => setIngredients(data))
        .catch(console.error)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!initialData) {
      setFormData({
        prepDate: new Date().toISOString().split('T')[0],
        sessionTime: 'MORNING',
        preparedBy: '',
        notes: '',
      })
      setPrepItems([])
      setCustomUsages([])
      setUseCustomUsage(false)
      return
    }

    setFormData({
      prepDate: initialData.prepDate.split('T')[0],
      sessionTime: initialData.sessionTime,
      preparedBy: initialData.preparedBy || '',
      notes: initialData.notes || '',
    })

    setPrepItems(
      initialData.prepItems.map((item) => ({
        menuItemId: item.menuItem.id,
        quantityPrepped: item.quantityPrepped,
      }))
    )

    if (initialData.inventoryUsages.length > 0) {
      setUseCustomUsage(true)
      setCustomUsages(
        initialData.inventoryUsages.map((usage) => ({
          ingredientId: usage.ingredient.id,
          quantityUsed: usage.quantityUsed,
        }))
      )
    }
  }, [open, initialData])

  const addPrepItem = () => {
    setPrepItems([...prepItems, { menuItemId: '', quantityPrepped: 1 }])
  }

  const removePrepItem = (index: number) => {
    setPrepItems(prepItems.filter((_, i) => i !== index))
  }

  const updatePrepItem = (index: number, field: keyof PrepItem, value: any) => {
    const updated = [...prepItems]
    updated[index] = { ...updated[index], [field]: value }
    setPrepItems(updated)
  }

  const addCustomUsage = () => {
    setCustomUsages([...customUsages, { ingredientId: '', quantityUsed: 0 }])
  }

  const removeCustomUsage = (index: number) => {
    setCustomUsages(customUsages.filter((_, i) => i !== index))
  }

  const updateCustomUsage = (index: number, field: keyof CustomUsage, value: any) => {
    const updated = [...customUsages]
    updated[index] = { ...updated[index], [field]: value }
    setCustomUsages(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (prepItems.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add at least one dish to prep',
        variant: 'destructive',
      })
      return
    }

    // Validate all items have menuItemId and quantity
    for (const item of prepItems) {
      if (!item.menuItemId || item.quantityPrepped <= 0) {
        toast({
          title: 'Error',
          description: 'Please fill in all prep item fields',
          variant: 'destructive',
        })
        return
      }
    }

    setLoading(true)

    try {
      const filteredCustomUsages = useCustomUsage
        ? customUsages.filter((usage) => usage.ingredientId && usage.quantityUsed > 0)
        : []
      const response = await fetch(
        initialData
          ? `/api/meal-prep/sessions/${initialData.id}`
          : '/api/meal-prep/sessions',
        {
          method: initialData ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prepDate: formData.prepDate,
            sessionTime: formData.sessionTime,
            preparedBy: formData.preparedBy || undefined,
            notes: formData.notes || undefined,
            items: prepItems.map((item) => ({
              menuItemId: item.menuItemId,
              quantityPrepped: Number(item.quantityPrepped),
            })),
            customUsages: filteredCustomUsages.length > 0 ? filteredCustomUsages : undefined,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create prep session')
      }

      toast({
        title: 'Success',
        description: initialData
          ? 'Meal prep session updated successfully'
          : 'Meal prep session created successfully',
      })

      if (!initialData) {
        setFormData({
          prepDate: new Date().toISOString().split('T')[0],
          sessionTime: 'MORNING',
          preparedBy: '',
          notes: '',
        })
        setPrepItems([])
        setCustomUsages([])
        setUseCustomUsage(false)
      }

      onSaved?.()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create prep session',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
        <DialogTitle>
          {initialData ? 'Edit Meal Prep Session' : 'Create Meal Prep Session'}
        </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prepDate">Prep Date</Label>
              <DatePicker
                value={formData.prepDate}
                onChange={(value) =>
                  setFormData({ ...formData, prepDate: value })
                }
              />
            </div>
            <div>
              <Label htmlFor="sessionTime">Session Time</Label>
              <Select
                value={formData.sessionTime}
                onValueChange={(value) =>
                  setFormData({ ...formData, sessionTime: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MORNING">Morning</SelectItem>
                  <SelectItem value="AFTERNOON">Afternoon</SelectItem>
                  <SelectItem value="EVENING">Evening</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="preparedBy">Prepared By (Optional)</Label>
            <Input
              id="preparedBy"
              value={formData.preparedBy}
              onChange={(e) =>
                setFormData({ ...formData, preparedBy: e.target.value })
              }
              placeholder="Cook name"
            />
          </div>

          <div>
            <Label>Dishes to Prep</Label>
            <div className="space-y-3 mt-2">
              {prepItems.map((item, index) => (
                <div
                  key={index}
                  className="flex gap-2 items-end p-3 border rounded-lg bg-slate-50"
                >
                  <div className="flex-1">
                    <Label className="text-xs">Menu Item</Label>
                    <Select
                      value={item.menuItemId}
                      onValueChange={(value) =>
                        updatePrepItem(index, 'menuItemId', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select dish" />
                      </SelectTrigger>
                      <SelectContent>
                        {menuItems.map((menuItem) => (
                          <SelectItem key={menuItem.id} value={menuItem.id}>
                            {menuItem.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantityPrepped}
                      onChange={(e) =>
                        updatePrepItem(
                          index,
                          'quantityPrepped',
                          parseInt(e.target.value) || 1
                        )
                      }
                      required
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePrepItem(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addPrepItem}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Dish
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">Custom Ingredient Usage (Optional)</Label>
                <p className="text-xs text-slate-500 mt-1">
                  Override recipe totals with actual quantities used in this batch.
                </p>
              </div>
              <Button
                type="button"
                variant={useCustomUsage ? 'default' : 'outline'}
                size="sm"
                onClick={() => setUseCustomUsage((prev) => !prev)}
              >
                {useCustomUsage ? 'Using Custom' : 'Use Custom'}
              </Button>
            </div>

            {useCustomUsage && (
              <div className="mt-4 space-y-3">
                {customUsages.map((usage, index) => (
                  <div
                    key={`${usage.ingredientId}-${index}`}
                    className="flex gap-2 items-end"
                  >
                    <div className="flex-1">
                      <Label className="text-xs">Ingredient</Label>
                      <Select
                        value={usage.ingredientId}
                        onValueChange={(value) =>
                          updateCustomUsage(index, 'ingredientId', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select ingredient" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredients.map((ingredient) => (
                            <SelectItem key={ingredient.id} value={ingredient.id}>
                              {ingredient.name} ({ingredient.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-36">
                      <Label className="text-xs">Quantity Used</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={usage.quantityUsed || ''}
                        onChange={(e) =>
                          updateCustomUsage(
                            index,
                            'quantityUsed',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        placeholder="0"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCustomUsage(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={addCustomUsage}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Ingredient
                </Button>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || prepItems.length === 0}>
              {loading ? 'Creating...' : 'Create Prep Session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
