"use client"

import { useEffect, useState } from 'react'
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

export default function AddDeliveryModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [formData, setFormData] = useState({
    ingredientId: '',
    supplierName: '',
    quantity: '',
    unitCost: '',
    transportCost: '',
    deliveryDate: new Date().toISOString().split('T')[0],
    invoiceNumber: '',
    notes: '',
  })

  useEffect(() => {
    if (!open) return
    fetch('/api/inventory')
      .then((res) => res.json())
      .then((data) => setIngredients(data))
      .catch(console.error)
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredientId: formData.ingredientId,
          supplierName: formData.supplierName,
          quantity: parseFloat(formData.quantity),
          unitCost: parseFloat(formData.unitCost),
          transportCost: formData.transportCost ? parseFloat(formData.transportCost) : 0,
          deliveryDate: formData.deliveryDate,
          invoiceNumber: formData.invoiceNumber || undefined,
          notes: formData.notes || undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to record delivery')
      }

      toast({
        title: 'Success',
        description: 'Delivery recorded and inventory updated.',
      })

      setFormData({
        ingredientId: '',
        supplierName: '',
        quantity: '',
        unitCost: '',
        transportCost: '',
        deliveryDate: new Date().toISOString().split('T')[0],
        invoiceNumber: '',
        notes: '',
      })
      onSaved()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to record delivery',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const totalCost =
    formData.quantity && formData.unitCost
      ? parseFloat(formData.quantity) * parseFloat(formData.unitCost)
      : 0
  const transportCost = formData.transportCost ? parseFloat(formData.transportCost) : 0
  const totalWithTransport = totalCost + transportCost

  const selectedIngredient = ingredients.find((ing) => ing.id === formData.ingredientId)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Delivery</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Ingredient</Label>
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
              <Label>Supplier</Label>
              <Input
                value={formData.supplierName}
                onChange={(e) =>
                  setFormData({ ...formData, supplierName: e.target.value })
                }
                placeholder="Fresh Farms"
                required
              />
            </div>
            <div>
              <Label>Delivery Date</Label>
              <DatePicker
                value={formData.deliveryDate}
                onChange={(value) =>
                  setFormData({ ...formData, deliveryDate: value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quantity</Label>
              <Input
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
              <Label>Unit Cost</Label>
              <Input
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Transport Cost (Optional)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.transportCost}
                onChange={(e) =>
                  setFormData({ ...formData, transportCost: e.target.value })
                }
              />
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-sm text-slate-600">Total + Transport</p>
              <p className="text-lg font-semibold">
                {totalWithTransport.toLocaleString()} IQD
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Invoice Number (Optional)</Label>
              <Input
                value={formData.invoiceNumber}
                onChange={(e) =>
                  setFormData({ ...formData, invoiceNumber: e.target.value })
                }
                placeholder="INV-1004"
              />
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-sm text-slate-600">Total Cost</p>
              <p className="text-lg font-semibold">
                {totalCost.toLocaleString()} IQD
              </p>
              {selectedIngredient && (
                <p className="text-xs text-slate-500 mt-1">
                  Current cost: {selectedIngredient.costPerUnit.toLocaleString()} IQD/{selectedIngredient.unit}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
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
            <Button type="submit" disabled={loading || !formData.ingredientId}>
              {loading ? 'Saving...' : 'Record Delivery'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
