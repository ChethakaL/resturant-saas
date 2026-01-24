'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { Ingredient } from '@prisma/client'

export default function IngredientEditForm({
  ingredient,
}: {
  ingredient: Ingredient
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: ingredient.name,
    unit: ingredient.unit,
    costPerUnit: ingredient.costPerUnit.toString(),
    supplier: ingredient.supplier || '',
    notes: ingredient.notes || '',
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
          supplier: formData.supplier || null,
          notes: formData.notes || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update ingredient')
      }

      router.push('/inventory')
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

      router.push('/inventory')
      router.refresh()
    } catch (error) {
      console.error('Error deleting ingredient:', error)
      alert('Failed to delete ingredient. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/inventory">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Edit Ingredient</h1>
            <p className="text-slate-500 mt-1">Update ingredient details</p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDelete} disabled={loading}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>

      <Card>
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
              <Link href="/inventory">
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
    </div>
  )
}
