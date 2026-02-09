'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, UtensilsCrossed, Store } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Analytics = {
  menuItemsUsingYourIngredients: number
  restaurantsUsingYourIngredients: number
  topIngredientsByRecipeUsage: { supplierProductId: string; name: string; menuItemCount: number }[]
}

export default function SupplierAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/supplier/analytics')
      .then((res) => res.ok ? res.json() : null)
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-slate-500">Loading analytics...</p>
      </div>
    )
  }

  const stats = data ?? {
    menuItemsUsingYourIngredients: 0,
    restaurantsUsingYourIngredients: 0,
    topIngredientsByRecipeUsage: [],
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-600 mt-1">
          Recipe-based usage. Order-based metrics will appear when ordering is enabled.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Menu items using your ingredients</CardTitle>
            <UtensilsCrossed className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.menuItemsUsingYourIngredients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Restaurants using your ingredients</CardTitle>
            <Store className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.restaurantsUsingYourIngredients}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Top ingredients by recipe usage
          </CardTitle>
          <CardDescription>Number of menu items that use each of your products</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.topIngredientsByRecipeUsage.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">No usage data yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Menu items using it</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topIngredientsByRecipeUsage.map((row) => (
                  <TableRow key={row.supplierProductId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.menuItemCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
