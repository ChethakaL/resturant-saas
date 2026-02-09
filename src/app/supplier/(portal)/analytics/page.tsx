'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { BarChart3, UtensilsCrossed, Store, TrendingUp } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'

type Analytics = {
  menuItemsUsingYourIngredients: number
  restaurantsUsingYourIngredients: number
  topIngredientsByRecipeUsage: {
    supplierProductId: string
    name: string
    menuItemCount: number
  }[]
  stockRequestTrend: { month: string; count: number }[]
  topRestaurants: { restaurantId: string; name: string; menuItemCount: number }[]
}

type Restaurant = {
  restaurantId: string
  restaurantName: string
}

const DAY_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
] as const

export default function SupplierAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [days, setDays] = useState<number>(90)
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [useCustomRange, setUseCustomRange] = useState(false)

  // Restaurant list for dropdown
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])

  // Fetch restaurant list on mount
  useEffect(() => {
    fetch('/api/supplier/restaurants')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Restaurant[]) => setRestaurants(list))
      .catch(() => setRestaurants([]))
  }, [])

  // Fetch analytics data
  const fetchData = useCallback(() => {
    setLoading(true)

    let effectiveDays = days
    if (useCustomRange && customFrom && customTo) {
      const from = new Date(customFrom)
      const to = new Date(customTo)
      const diffMs = to.getTime() - from.getTime()
      effectiveDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
    }

    const params = new URLSearchParams()
    params.set('days', String(effectiveDays))
    if (restaurantId) {
      params.set('restaurantId', restaurantId)
    }

    fetch(`/api/supplier/analytics?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [days, restaurantId, useCustomRange, customFrom, customTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const stats = data ?? {
    menuItemsUsingYourIngredients: 0,
    restaurantsUsingYourIngredients: 0,
    topIngredientsByRecipeUsage: [],
    stockRequestTrend: [],
    topRestaurants: [],
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-600 mt-1">
          Recipe-based usage and stock request trends. Order-based metrics will appear when ordering
          is enabled.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Narrow down analytics by date range or restaurant</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            {/* Quick date range buttons */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Date Range</Label>
              <div className="flex gap-1.5">
                {DAY_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={!useCustomRange && days === opt.value ? 'default' : 'outline'}
                    onClick={() => {
                      setDays(opt.value)
                      setUseCustomRange(false)
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={useCustomRange ? 'default' : 'outline'}
                  onClick={() => setUseCustomRange(true)}
                >
                  Custom
                </Button>
              </div>
            </div>

            {/* Custom date inputs */}
            {useCustomRange && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="custom-from" className="text-xs text-slate-500">
                    From
                  </Label>
                  <Input
                    id="custom-from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="custom-to" className="text-xs text-slate-500">
                    To
                  </Label>
                  <Input
                    id="custom-to"
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-40"
                  />
                </div>
              </>
            )}

            {/* Restaurant filter */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Restaurant</Label>
              <Select
                value={restaurantId || 'all'}
                onValueChange={(val) => setRestaurantId(val === 'all' ? '' : val)}
              >
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="All restaurants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All restaurants</SelectItem>
                  {restaurants.map((r) => (
                    <SelectItem key={r.restaurantId} value={r.restaurantId}>
                      {r.restaurantName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center min-h-[120px]">
          <p className="text-slate-500">Loading analytics...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Menu items using your ingredients
                </CardTitle>
                <UtensilsCrossed className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.menuItemsUsingYourIngredients}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Restaurants using your ingredients
                </CardTitle>
                <Store className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.restaurantsUsingYourIngredients}</p>
              </CardContent>
            </Card>
          </div>

          {/* Top Ingredients Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Top Ingredients by Recipe Usage
              </CardTitle>
              <CardDescription>
                Number of menu items that use each of your products
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.topIngredientsByRecipeUsage.length === 0 ? (
                <p className="text-slate-500 py-6 text-center">No usage data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={stats.topIngredientsByRecipeUsage}
                    margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '13px',
                      }}
                    />
                    <Bar dataKey="menuItemCount" name="Menu Items" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top Restaurants Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Top Restaurants
              </CardTitle>
              <CardDescription>
                Restaurants with the most menu items using your products
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.topRestaurants.length === 0 ? (
                <p className="text-slate-500 py-6 text-center">No restaurant data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={stats.topRestaurants}
                    margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '13px',
                      }}
                    />
                    <Bar dataKey="menuItemCount" name="Menu Items" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Stock Requests Over Time Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Stock Requests Over Time
              </CardTitle>
              <CardDescription>
                Number of stock requests per month (last 6 months)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.stockRequestTrend.every((b) => b.count === 0) ? (
                <p className="text-slate-500 py-6 text-center">No stock request data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={stats.stockRequestTrend}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '13px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Stock Requests"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#10b981' }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
