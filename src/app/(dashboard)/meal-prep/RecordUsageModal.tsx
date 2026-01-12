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
import { useToast } from '@/components/ui/use-toast'
import DatePicker from '@/components/ui/date-picker'
import { Plus, X } from 'lucide-react'

interface Ingredient {
  id: string
  name: string
  unit: string
}

type UsageRow = {
  ingredientId: string
  quantityUsed: number
}

export default function RecordUsageModal({
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
  const [usageRows, setUsageRows] = useState<UsageRow[]>([
    { ingredientId: '', quantityUsed: 0 },
  ])
  const [formData, setFormData] = useState({
    prepDate: new Date().toISOString().split('T')[0],
    sessionTime: 'DIRECT_USAGE',
    preparedBy: '',
    notes: '',
  })

  useEffect(() => {
    if (!open) return
    fetch('/api/inventory')
      .then((res) => res.json())
      .then((data) => setIngredients(data))
      .catch(console.error)
  }, [open])

  const addRow = () => {
    setUsageRows([...usageRows, { ingredientId: '', quantityUsed: 0 }])
  }

  const removeRow = (index: number) => {
    setUsageRows(usageRows.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, field: keyof UsageRow, value: any) => {
    const updated = [...usageRows]
    updated[index] = { ...updated[index], [field]: value }
    setUsageRows(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = usageRows.filter((row) => row.ingredientId && row.quantityUsed > 0)
    if (cleaned.length === 0) {
      toast({
        title: 'Error',
        description: 'Add at least one ingredient usage.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/meal-prep/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prepDate: formData.prepDate,
          sessionTime: formData.sessionTime,
          preparedBy: formData.preparedBy || undefined,
          notes: formData.notes || undefined,
          items: [],
          customUsages: cleaned,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to record usage')
      }

      toast({
        title: 'Saved',
        description: 'Direct ingredient usage recorded.',
      })
      setUsageRows([{ ingredientId: '', quantityUsed: 0 }])
      setFormData({
        prepDate: new Date().toISOString().split('T')[0],
        sessionTime: 'DIRECT_USAGE',
        preparedBy: '',
        notes: '',
      })
      onSaved()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to record usage',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Direct Ingredient Usage</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <DatePicker
                value={formData.prepDate}
                onChange={(value) => setFormData({ ...formData, prepDate: value })}
              />
            </div>
            <div>
              <Label>Prepared By (Optional)</Label>
              <Input
                value={formData.preparedBy}
                onChange={(e) => setFormData({ ...formData, preparedBy: e.target.value })}
                placeholder="Cook name"
              />
            </div>
          </div>

          <div className="space-y-3">
            {usageRows.map((row, index) => (
              <div key={index} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Ingredient</Label>
                  <Select
                    value={row.ingredientId}
                    onValueChange={(value) => updateRow(index, 'ingredientId', value)}
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
                <div className="w-32">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={row.quantityUsed || ''}
                    onChange={(e) =>
                      updateRow(index, 'quantityUsed', parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addRow} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Ingredient
            </Button>
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <Input
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Reason for usage"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Record Usage'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
