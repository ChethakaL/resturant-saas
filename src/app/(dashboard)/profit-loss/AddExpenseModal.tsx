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
import DatePicker from '@/components/ui/date-picker'

interface Ingredient {
  id: string
  name: string
  unit: string
  costPerUnit: number
}

type ExpenseTransaction = {
  id: string
  name: string
  category: 'RENT' | 'UTILITIES' | 'INVENTORY_PURCHASE' | 'MARKETING' | 'MAINTENANCE' | 'OTHER'
  amount: number
  date: string
  notes?: string | null
  ingredientId?: string | null
  quantity?: number | null
  unitCost?: number | null
}

export default function AddExpenseModal({
  open,
  onClose,
  initialData,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initialData?: ExpenseTransaction | null
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [formData, setFormData] = useState({
    name: '',
    category: 'OTHER' as 'RENT' | 'UTILITIES' | 'INVENTORY_PURCHASE' | 'MARKETING' | 'MAINTENANCE' | 'OTHER',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    ingredientId: '',
    quantity: '',
    unitCost: '',
    otherCategory: '',
  })

  useEffect(() => {
    if (!open) return
    if (initialData) {
      setFormData({
        name: initialData.name,
        category: initialData.category,
        amount: initialData.amount.toString(),
        date: initialData.date.split('T')[0],
        notes: initialData.notes || '',
        ingredientId: initialData.ingredientId || '',
        quantity: initialData.quantity?.toString() || '',
        unitCost: initialData.unitCost?.toString() || '',
        otherCategory: '',
      })
      return
    }
    setFormData({
      name: '',
      category: 'OTHER',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
      ingredientId: '',
      quantity: '',
      unitCost: '',
      otherCategory: '',
    })
  }, [open, initialData])

  useEffect(() => {
    if (open && formData.category === 'INVENTORY_PURCHASE') {
      fetch('/api/inventory')
        .then((res) => res.json())
        .then((data) => setIngredients(data))
        .catch(console.error)
    }
  }, [open, formData.category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (initialData?.category === 'INVENTORY_PURCHASE') {
        throw new Error('Inventory purchase edits are not supported yet')
      }
      const payload: any = {
        name: formData.category === 'OTHER' && formData.otherCategory 
          ? formData.otherCategory 
          : formData.name || (formData.category === 'INVENTORY_PURCHASE' && formData.ingredientId
            ? `Purchase: ${ingredients.find((i) => i.id === formData.ingredientId)?.name || ''}`
            : formData.name),
        category: formData.category,
        amount: formData.category === 'INVENTORY_PURCHASE' && formData.quantity && formData.unitCost
          ? parseFloat(formData.quantity) * parseFloat(formData.unitCost)
          : parseFloat(formData.amount),
        date: formData.date,
        notes: formData.notes,
      }

      if (formData.category === 'INVENTORY_PURCHASE') {
        if (!formData.ingredientId || !formData.quantity || !formData.unitCost) {
          throw new Error('Please fill in all inventory purchase fields')
        }
        payload.ingredientId = formData.ingredientId
        payload.quantity = parseFloat(formData.quantity)
        payload.unitCost = parseFloat(formData.unitCost)
      }

      const response = await fetch(
        initialData
          ? `/api/expenses/transactions/${initialData.id}`
          : '/api/expenses/transactions',
        {
          method: initialData ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create expense')
      }

      toast({
        title: 'Success',
        description: initialData ? 'Expense updated successfully' : 'Expense recorded successfully',
      })

      if (!initialData) {
        setFormData({
          name: '',
          category: 'OTHER',
          amount: '',
          date: new Date().toISOString().split('T')[0],
          notes: '',
          ingredientId: '',
          quantity: '',
          unitCost: '',
          otherCategory: '',
        })
      }

      onSaved?.()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create expense',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const selectedIngredient = ingredients.find((i) => i.id === formData.ingredientId)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
        <DialogTitle>{initialData ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value: any) =>
                setFormData({ ...formData, category: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RENT">Rent</SelectItem>
                <SelectItem value="UTILITIES">Utilities</SelectItem>
                <SelectItem value="INVENTORY_PURCHASE">Inventory Purchase</SelectItem>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.category === 'INVENTORY_PURCHASE' ? (
            <>
              <div>
                <Label htmlFor="ingredient">Ingredient</Label>
                <Select
                  value={formData.ingredientId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, ingredientId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ingredient" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((ing) => (
                      <SelectItem key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="unitCost">Unit Cost</Label>
                  <Input
                    id="unitCost"
                    type="number"
                    step="0.01"
                    value={formData.unitCost}
                    onChange={(e) =>
                      setFormData({ ...formData, unitCost: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              {formData.quantity && formData.unitCost && (
                <div className="p-3 bg-slate-50 rounded">
                  <p className="text-sm text-slate-600">
                    Total Cost:{' '}
                    <span className="font-semibold">
                      {(
                        parseFloat(formData.quantity) *
                        parseFloat(formData.unitCost)
                      ).toLocaleString()}{' '}
                      IQD
                    </span>
                  </p>
                  {selectedIngredient && (
                    <p className="text-xs text-slate-500 mt-1">
                      Current stock: {selectedIngredient.costPerUnit.toLocaleString()} IQD per{' '}
                      {selectedIngredient.unit}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="name">
                  {formData.category === 'OTHER' ? 'Expense Name' : 'Description'}
                </Label>
                {formData.category === 'OTHER' ? (
                  <Input
                    id="name"
                    value={formData.otherCategory}
                    onChange={(e) =>
                      setFormData({ ...formData, otherCategory: e.target.value })
                    }
                    placeholder="Enter expense name"
                    required
                  />
                ) : (
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Enter description"
                    required
                  />
                )}
              </div>
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  required
                />
              </div>
            </>
          )}

          <div>
              <Label htmlFor="date">Date</Label>
              <DatePicker
                value={formData.date}
                onChange={(value) => setFormData({ ...formData, date: value })}
              />
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
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
