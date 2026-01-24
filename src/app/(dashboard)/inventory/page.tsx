import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus } from 'lucide-react'
import Link from 'next/link'

const PAGE_SIZE = 25

async function getInventoryData(restaurantId: string, page: number) {
  const skip = (page - 1) * PAGE_SIZE

  const [totalCount, ingredients] = await Promise.all([
    prisma.ingredient.count({ where: { restaurantId } }),
    prisma.ingredient.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      skip,
      take: PAGE_SIZE,
    }),
  ])

  return {
    ingredients,
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
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
          <p className="text-slate-500 mt-1">Manage your ingredients</p>
        </div>
        <Link href="/inventory/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Ingredient
          </Button>
        </Link>
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
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Unit
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Cost/Unit
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.ingredients.map((ingredient) => (
                  <tr key={ingredient.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{ingredient.name}</div>
                      {ingredient.supplier && (
                        <div className="text-sm text-slate-500">{ingredient.supplier}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{ingredient.unit}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(ingredient.costPerUnit)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/inventory/${ingredient.id}`}>
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
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
