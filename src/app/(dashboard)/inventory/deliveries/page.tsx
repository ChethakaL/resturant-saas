"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import DatePicker from '@/components/ui/date-picker'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import AddDeliveryModal from './AddDeliveryModal'

interface Ingredient {
  id: string
  name: string
  unit: string
}

interface Delivery {
  id: string
  supplierName: string
  quantity: number
  unitCost: number
  totalCost: number
  transportCost: number
  deliveryDate: string
  invoiceNumber?: string | null
  notes?: string | null
  ingredient: Ingredient
}

export default function DeliveriesPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [showModal, setShowModal] = useState(false)
  const [filters, setFilters] = useState({
    ingredientId: 'ALL',
    supplier: '',
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0],
    endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
      .toISOString()
      .split('T')[0],
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.ingredientId !== 'ALL') params.set('ingredientId', filters.ingredientId)
      if (filters.supplier) params.set('supplier', filters.supplier)
      if (filters.startDate && filters.endDate) {
        params.set('startDate', filters.startDate)
        params.set('endDate', filters.endDate)
      }

      const [deliveryRes, ingredientRes] = await Promise.all([
        fetch(`/api/deliveries?${params.toString()}`),
        fetch('/api/inventory'),
      ])

      if (!deliveryRes.ok || !ingredientRes.ok) {
        throw new Error('Failed to fetch data')
      }

      const [deliveryData, ingredientData] = await Promise.all([
        deliveryRes.json(),
        ingredientRes.json(),
      ])

      setDeliveries(deliveryData)
      setIngredients(ingredientData)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load deliveries',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalDelivered = deliveries.reduce((sum, d) => sum + d.totalCost + d.transportCost, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Deliveries</h1>
          <p className="text-slate-500 mt-1">
            Track supplier deliveries and auto-create COGS expenses
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>Record Delivery</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <Label>Ingredient</Label>
            <Select
              value={filters.ingredientId}
              onValueChange={(value) => setFilters({ ...filters, ingredientId: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Ingredients</SelectItem>
                {ingredients.map((ing) => (
                  <SelectItem key={ing.id} value={ing.id}>
                    {ing.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Supplier</Label>
            <Input
              value={filters.supplier}
              onChange={(e) => setFilters({ ...filters, supplier: e.target.value })}
              placeholder="Fresh Farms"
            />
          </div>
          <div>
            <Label>Start Date</Label>
            <DatePicker
              value={filters.startDate}
              onChange={(value) => setFilters({ ...filters, startDate: value })}
            />
          </div>
          <div>
            <Label>End Date</Label>
            <DatePicker
              value={filters.endDate}
              onChange={(value) => setFilters({ ...filters, endDate: value })}
            />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <Button variant="outline" onClick={fetchData}>
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Delivery History</CardTitle>
          <div className="text-sm text-slate-500">
            Total: {formatCurrency(totalDelivered)}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 font-semibold">Date</th>
                  <th className="text-left p-3 font-semibold">Ingredient</th>
                  <th className="text-left p-3 font-semibold">Supplier</th>
                  <th className="text-right p-3 font-semibold">Quantity</th>
                  <th className="text-right p-3 font-semibold">Unit Cost</th>
                  <th className="text-right p-3 font-semibold">Total</th>
                  <th className="text-right p-3 font-semibold">Transport</th>
                  <th className="text-left p-3 font-semibold">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id} className="border-b">
                    <td className="p-3">
                      {new Date(delivery.deliveryDate).toLocaleDateString()}
                    </td>
                    <td className="p-3">{delivery.ingredient.name}</td>
                    <td className="p-3">{delivery.supplierName}</td>
                    <td className="p-3 text-right font-mono">
                      {delivery.quantity} {delivery.ingredient.unit}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(delivery.unitCost)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(delivery.totalCost)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(delivery.transportCost)}
                    </td>
                    <td className="p-3">{delivery.invoiceNumber || '-'}</td>
                  </tr>
                ))}
                {!loading && deliveries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500">
                      No deliveries found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AddDeliveryModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={fetchData}
      />
    </div>
  )
}
