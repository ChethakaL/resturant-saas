'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import DatePicker from '@/components/ui/date-picker'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { Pencil, Plus, Trash2, ChefHat } from 'lucide-react'
import CreatePrepSessionModal from './CreatePrepSessionModal'

interface PreppedStock {
  id: string
  menuItemId: string
  menuItem: {
    id: string
    name: string
    price: number
  }
  availableQuantity: number
  lastUpdated: string
}

interface PrepSession {
  id: string
  prepDate: string
  sessionTime: string
  preparedBy: string | null
  notes: string | null
  prepItems: Array<{
    id: string
    menuItem: {
      id: string
      name: string
    }
    quantityPrepped: number
  }>
  inventoryUsages: Array<{
    id: string
    ingredient: {
      id: string
      name: string
      unit: string
    }
    quantityUsed: number
  }>
}

export default function MealPrepPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [preppedStock, setPreppedStock] = useState<PreppedStock[]>([])
  const [todaySessions, setTodaySessions] = useState<PrepSession[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingSession, setEditingSession] = useState<PrepSession | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [stockRes, sessionsRes] = await Promise.all([
        fetch('/api/meal-prep/stock'),
        fetch(`/api/meal-prep/sessions?date=${selectedDate}`),
      ])

      if (!stockRes.ok || !sessionsRes.ok) {
        throw new Error('Failed to fetch data')
      }

      const [stock, sessions] = await Promise.all([
        stockRes.json(),
        sessionsRes.json(),
      ])

      setPreppedStock(stock)
      setTodaySessions(sessions)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load meal prep data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSession = async (id: string) => {
    if (!confirm('Delete this prep session? This will restore inventory and prepped stock.')) return

    try {
      const response = await fetch(`/api/meal-prep/sessions/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete prep session')
      toast({
        title: 'Deleted',
        description: 'Prep session removed and inventory restored.',
      })
      fetchData()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete prep session',
        variant: 'destructive',
      })
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Meal Prep</h1>
          <p className="text-slate-500 mt-1">Manage batch production and prepped dishes</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Prep Session
        </Button>
      </div>

      {/* Date Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Date</CardTitle>
        </CardHeader>
        <CardContent>
          <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            className="max-w-xs"
          />
        </CardContent>
      </Card>

      {/* Prepped Stock Status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Prepped Stock</CardTitle>
        </CardHeader>
        <CardContent>
          {preppedStock.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No prepped dishes available</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {preppedStock.map((stock) => (
                <div
                  key={stock.id}
                  className={`p-4 rounded-lg border ${
                    stock.availableQuantity > 0
                      ? 'bg-green-50 border-green-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {stock.menuItem.name}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Available: {stock.availableQuantity} portions
                      </p>
                    </div>
                    <ChefHat
                      className={`h-8 w-8 ${
                        stock.availableQuantity > 0 ? 'text-green-600' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Prep Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>
            Prep Sessions - {new Date(selectedDate).toLocaleDateString()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todaySessions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              No prep sessions for this date
            </p>
          ) : (
            <div className="space-y-4">
              {todaySessions.map((session) => (
                <div
                  key={session.id}
                  className="p-4 border rounded-lg bg-slate-50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {session.sessionTime}
                      </h3>
                      {session.preparedBy && (
                        <p className="text-sm text-slate-500">
                          Prepared by: {session.preparedBy}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingSession(session)
                          setShowCreateModal(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteSession(session.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-slate-700">
                      Prepped Dishes:
                    </h4>
                    <ul className="list-disc list-inside space-y-1">
                      {session.prepItems.map((item) => (
                        <li key={item.id} className="text-sm text-slate-600">
                          {item.menuItem.name}: {item.quantityPrepped} portions
                        </li>
                      ))}
                    </ul>

                    <h4 className="text-sm font-medium text-slate-700 mt-3">
                      Ingredients Used:
                    </h4>
                    <ul className="list-disc list-inside space-y-1">
                      {session.inventoryUsages.map((usage) => (
                        <li key={usage.id} className="text-sm text-slate-600">
                          {usage.ingredient.name}: {usage.quantityUsed}{' '}
                          {usage.ingredient.unit}
                        </li>
                      ))}
                    </ul>

                    {session.notes && (
                      <p className="text-sm text-slate-500 mt-2 italic">
                        Notes: {session.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreatePrepSessionModal
        open={showCreateModal}
        initialData={editingSession}
        onClose={() => {
          setShowCreateModal(false)
          setEditingSession(null)
        }}
        onSaved={() => fetchData()}
      />
    </div>
  )
}
