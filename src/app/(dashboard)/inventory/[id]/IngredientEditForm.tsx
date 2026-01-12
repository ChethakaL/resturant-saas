'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Save, Trash2, Plus, Minus } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Ingredient, StockAdjustment } from '@prisma/client'

interface IngredientWithAdjustments extends Ingredient {
  stockAdjustments: StockAdjustment[]
}

export default function IngredientEditForm({
  ingredient,
}: {
  ingredient: IngredientWithAdjustments
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showAdjustment, setShowAdjustment] = useState(false)
  const [formData, setFormData] = useState({
    name: ingredient.name,
    unit: ingredient.unit,
    costPerUnit: ingredient.costPerUnit.toString(),
    minStockLevel: ingredient.minStockLevel.toString(),
    supplier: ingredient.supplier || '',
    notes: ingredient.notes || '',
  })
  const [adjustmentData, setAdjustmentData] = useState({
    type: 'add',
    quantity: '',
    reason: '',
    notes: '',
  })

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/inventory/${ingredient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          unit: formData.unit,
          costPerUnit: parseFloat(formData.costPerUnit),
          minStockLevel: parseFloat(formData.minStockLevel),
          supplier: formData.supplier || null,
          notes: formData.notes || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update ingredient')
      }

      router.push('/dashboard/inventory')
      router.refresh()
    } catch (error) {
      console.error('Error updating ingredient:', error)
      alert('Failed to update ingredient. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this ingredient? This action cannot be undone.')) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/inventory/${ingredient.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete ingredient')
      }

      router.push('/dashboard/inventory')
      router.refresh()
    } catch (error) {
      console.error('Error deleting ingredient:', error)
      alert('Failed to delete ingredient. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const quantityChange = parseFloat(adjustmentData.quantity)
      const finalQuantity = adjustmentData.type === 'add' ? quantityChange : -quantityChange

      const response = await fetch(`/api/inventory/${ingredient.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantityChange: finalQuantity,
          reason: adjustmentData.reason,
          notes: adjustmentData.notes || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to adjust stock')
      }

      setShowAdjustment(false)
      setAdjustmentData({
        type: 'add',
        quantity: '',
        reason: '',
        notes: '',
      })
      router.refresh()
    } catch (error) {
      console.error('Error adjusting stock:', error)
      alert('Failed to adjust stock. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/inventory">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Edit Ingredient</h1>
            <p className="text-slate-500 mt-1">Update ingredient details and manage stock</p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDelete} disabled={loading}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ingredient Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdate} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Ingredient Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">
                    Unit <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="unit"
                    required
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="costPerUnit">
                    Cost Per Unit (IQD) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="costPerUnit"
                    type="number"
                    step="0.01"
                    required
                    value={formData.costPerUnit}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minStockLevel">
                    Minimum Stock Level <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="minStockLevel"
                    type="number"
                    step="0.01"
                    required
                    value={formData.minStockLevel}
                    onChange={(e) => setFormData({ ...formData, minStockLevel: e.target.value })}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input
                    id="supplier"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Link href="/dashboard/inventory">
                  <Button type="button" variant="outline" disabled={loading}>
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Current Stock</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-3xl font-bold text-slate-900">
                  {ingredient.stockQuantity.toFixed(2)}
                </div>
                <div className="text-sm text-slate-500">{ingredient.unit}</div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Value:</span>
                  <span className="font-medium">
                    {formatCurrency(ingredient.stockQuantity * ingredient.costPerUnit)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Min Level:</span>
                  <span className="font-medium">{ingredient.minStockLevel.toFixed(2)} {ingredient.unit}</span>
                </div>
              </div>

              {!showAdjustment ? (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => setShowAdjustment(true)}
                >
                  Adjust Stock
                </Button>
              ) : (
                <form onSubmit={handleStockAdjustment} className="space-y-3">
                  <div className="space-y-2">
                    <Label>Adjustment Type</Label>
                    <Select
                      value={adjustmentData.type}
                      onValueChange={(value) =>
                        setAdjustmentData({ ...adjustmentData, type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add">
                          <div className="flex items-center gap-2">
                            <Plus className="h-4 w-4 text-green-600" />
                            Add Stock
                          </div>
                        </SelectItem>
                        <SelectItem value="remove">
                          <div className="flex items-center gap-2">
                            <Minus className="h-4 w-4 text-red-600" />
                            Remove Stock
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.01"
                      required
                      value={adjustmentData.quantity}
                      onChange={(e) =>
                        setAdjustmentData({ ...adjustmentData, quantity: e.target.value })
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Select
                      value={adjustmentData.reason}
                      onValueChange={(value) =>
                        setAdjustmentData({ ...adjustmentData, reason: value })
                      }
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="purchase">Purchase</SelectItem>
                        <SelectItem value="waste">Waste</SelectItem>
                        <SelectItem value="adjustment">Adjustment</SelectItem>
                        <SelectItem value="return">Return</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="adjustmentNotes">Notes</Label>
                    <Textarea
                      id="adjustmentNotes"
                      value={adjustmentData.notes}
                      onChange={(e) =>
                        setAdjustmentData({ ...adjustmentData, notes: e.target.value })
                      }
                      placeholder="Optional notes..."
                      rows={2}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAdjustment(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" className="flex-1" disabled={loading}>
                      Apply
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ingredient.stockAdjustments.length === 0 ? (
                  <p className="text-sm text-slate-500">No adjustments yet</p>
                ) : (
                  ingredient.stockAdjustments.map((adjustment) => (
                    <div
                      key={adjustment.id}
                      className="flex items-start justify-between text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="space-y-1">
                        <div className="font-medium capitalize">{adjustment.reason.replace('_', ' ')}</div>
                        {adjustment.notes && (
                          <div className="text-xs text-slate-500">{adjustment.notes}</div>
                        )}
                        <div className="text-xs text-slate-400">
                          {new Date(adjustment.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div
                        className={`font-mono font-medium ${
                          adjustment.quantityChange > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {adjustment.quantityChange > 0 ? '+' : ''}
                        {adjustment.quantityChange.toFixed(2)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
