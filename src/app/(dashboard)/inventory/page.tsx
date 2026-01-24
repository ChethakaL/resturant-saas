import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, AlertTriangle, Check } from 'lucide-react'
import Link from 'next/link'

const PAGE_SIZE = 25

async function getInventoryData(restaurantId: string, page: number) {
  const skip = (page - 1) * PAGE_SIZE

  // Run all queries in parallel for better performance
  const [
    totalCount,
    ingredients,
    aggregates,
  ] = await Promise.all([
    prisma.ingredient.count({ where: { restaurantId } }),
    prisma.ingredient.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      skip,
      take: PAGE_SIZE,
    }),
    // Get summary stats from all ingredients (lightweight aggregate)
    prisma.ingredient.findMany({
      where: { restaurantId },
      select: {
        stockQuantity: true,
        costPerUnit: true,
        minStockLevel: true,
      },
    }),
  ])

  // Calculate totals from aggregates
  const totalValue = aggregates.reduce(
    (sum, ing) => sum + (ing.stockQuantity * ing.costPerUnit),
    0
  )

  const lowStockCount = aggregates.filter(
    ing => ing.stockQuantity < ing.minStockLevel
  ).length

  const criticalStockCount = aggregates.filter(
    ing => ing.stockQuantity < (ing.minStockLevel * 0.25)
  ).length

  return {
    ingredients,
    totalValue,
    lowStockCount,
    criticalStockCount,
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  }
}

function getStockStatus(stockQuantity: number, minStockLevel: number) {
  if (stockQuantity < minStockLevel * 0.25) {
    return {
      label: 'CRITICAL',
      color: 'bg-red-100 text-red-800 border-red-200',
      icon: AlertTriangle,
    }
  }
  if (stockQuantity < minStockLevel) {
    return {
      label: 'LOW',
      color: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: AlertTriangle,
    }
  }
  return {
    label: 'OK',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: Check,
  }
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: { page?: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId
  const page = Math.max(Number(searchParams?.page || 1), 1)

  const data = await getInventoryData(restaurantId, page)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Inventory Management</h1>
          <p className="text-slate-500 mt-1">Track ingredients and stock levels</p>
        </div>
        <Link href="/inventory/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Ingredient
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalValue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{data.lowStockCount}</div>
            <p className="text-xs text-slate-500 mt-1">Below minimum level</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Critical Stock Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{data.criticalStockCount}</div>
            <p className="text-xs text-slate-500 mt-1">Below 25% of minimum</p>
          </CardContent>
        </Card>
      </div>

      {/* Ingredients Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Ingredients</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Ingredient
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Stock
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Unit
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Cost/Unit
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Total Value
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.ingredients.map((ingredient) => {
                  const status = getStockStatus(ingredient.stockQuantity, ingredient.minStockLevel)
                  const StatusIcon = status.icon
                  const totalValue = ingredient.stockQuantity * ingredient.costPerUnit

                  return (
                    <tr key={ingredient.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{ingredient.name}</div>
                        {ingredient.supplier && (
                          <div className="text-sm text-slate-500">{ingredient.supplier}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {ingredient.stockQuantity.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{ingredient.unit}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatCurrency(ingredient.costPerUnit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium">
                        {formatCurrency(totalValue)}
                      </td>
                      <td className="py-3 px-4">
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${status.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/inventory/${ingredient.id}`}>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {data.ingredients.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-500">No ingredients found. Add your first ingredient to get started.</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 mt-4">
              <p className="text-sm text-slate-500">
                Page {page} of {data.totalPages} ({data.totalCount} ingredients)
              </p>
              <div className="flex items-center gap-2">
                <Link href={`/dashboard/inventory?page=${Math.max(page - 1, 1)}`}>
                  <Button variant="outline" size="sm" disabled={page <= 1}>
                    Previous
                  </Button>
                </Link>
                <Link href={`/dashboard/inventory?page=${Math.min(page + 1, data.totalPages)}`}>
                  <Button variant="outline" size="sm" disabled={page >= data.totalPages}>
                    Next
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
