'use client'

import { useState, useEffect } from 'react'
import { useFormatCurrency } from '@/lib/i18n'
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
  stockQuantity: number
  costPerUnit: number
}

export default function AddWasteModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const formatCurrency = useFormatCurrency()
  const [loading, setLoading] = useState(false)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [formData, setFormData] = useState({
    ingredientId: '',
    quantity: '',
    date: new Date().toISOString().split('T')[0],
    reason: '',
    notes: '',
  })

  useEffect(() => {
    if (open) {
      fetch('/api/inventory')
        .then((res) => res.json())
        .then((data) => setIngredients(data))
        .catch(console.error)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const selectedIngredient = ingredients.find(
        (i) => i.id === formData.ingredientId
      )

      if (!selectedIngredient) {
        throw new Error('Please select an ingredient')
      }

      if (parseFloat(formData.quantity) > selectedIngredient.stockQuantity) {
        throw new Error(
          `Insufficient stock. Available: ${selectedIngredient.stockQuantity} ${selectedIngredient.unit}`
        )
      }

      const response = await fetch('/api/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredientId: formData.ingredientId,
          quantity: parseFloat(formData.quantity),
          date: formData.date,
          reason: formData.reason,
          notes: formData.notes,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to record waste')
      }

      toast({
        title: 'Success',
        description: 'Waste recorded successfully',
      })

      // Reset form
      setFormData({
        ingredientId: '',
        quantity: '',
        date: new Date().toISOString().split('T')[0],
        reason: '',
        notes: '',
      })

      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to record waste',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const selectedIngredient = ingredients.find(
    (i) => i.id === formData.ingredientId
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Waste</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
                    {ing.name} ({ing.unit}) - Stock: {ing.stockQuantity.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedIngredient && (
            <div className="p-3 bg-amber-50 rounded border border-amber-200">
              <p className="text-sm text-amber-800">
                Available: {selectedIngredient.stockQuantity.toFixed(2)}{' '}
                {selectedIngredient.unit}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Cost per unit: {formatCurrency(selectedIngredient.costPerUnit)}
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="quantity">Quantity Wasted</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({ ...formData, quantity: e.target.value })
              }
              required
              min="0"
              max={selectedIngredient?.stockQuantity || undefined}
            />
            {selectedIngredient && formData.quantity && (
              <p className="text-xs text-slate-500 mt-1">
                Cost impact:{' '}
                {formatCurrency(
                  parseFloat(formData.quantity) * selectedIngredient.costPerUnit
                )}
              </p>
            )}
          </div>

          <div>
              <Label htmlFor="date">Date</Label>
              <DatePicker
                value={formData.date}
                onChange={(value) => setFormData({ ...formData, date: value })}
              />
            </div>

          <div>
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Input
              id="reason"
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
              placeholder="e.g., spoilage, leftover, damage"
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
              {loading ? 'Recording...' : 'Record Waste'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
