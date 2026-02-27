'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

const UNIT_OPTIONS = [
  { value: 'g', label: 'Grams (g)' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'ml', label: 'Millilitres (ml)' },
  { value: 'L', label: 'Litres (L)' },
  { value: 'piece', label: 'Piece / Each' },
]

export default function NewIngredientPage() {
  const router = useRouter()
  const { currency } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    unit: 'g',
    costPerUnit: '',
    supplier: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const cost = parseFloat(formData.costPerUnit)
    if (!cost || cost <= 0) {
      setError('Cost per unit must be greater than 0.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          unit: formData.unit,
          costPerUnit: cost,
          supplier: formData.supplier || null,
          notes: formData.notes || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create ingredient')
      }

      router.push('/inventory')
      router.refresh()
    } catch (err) {
      console.error('Error creating ingredient:', err)
      setError('Failed to create ingredient. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Add New Ingredient</h1>
          <p className="text-slate-500 mt-1">Add a new ingredient to your inventory</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingredient Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

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
                  placeholder="e.g., Chicken Breast"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">
                  Unit of Measure <span className="text-red-500">*</span>
                </Label>
                <select
                  id="unit"
                  required
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  Cost per unit will be in {currency} per {formData.unit}.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="costPerUnit">
                  Cost Per {formData.unit} ({currency}) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="costPerUnit"
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={formData.costPerUnit}
                  onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                  placeholder="e.g., 5000"
                />
                <p className="text-xs text-slate-500">Must be greater than 0.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="e.g., ABC Suppliers"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this ingredient..."
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
                {loading ? 'Saving...' : 'Save Ingredient'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
