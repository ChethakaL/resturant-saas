import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { Plus, Edit } from 'lucide-react'
import Link from 'next/link'

async function getMenuData(restaurantId: string) {
  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId },
    include: {
      category: true,
      ingredients: {
        include: {
          ingredient: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Calculate cost and margin for each item
  const itemsWithMetrics = menuItems.map((item) => {
    const cost = item.ingredients.reduce(
      (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    const margin = ((item.price - cost) / item.price) * 100

    return {
      ...item,
      cost,
      margin,
      profit: item.price - cost,
    }
  })

  const categories = await prisma.category.findMany({
    where: { restaurantId },
    orderBy: { displayOrder: 'asc' },
  })

  return {
    menuItems: itemsWithMetrics,
    categories,
  }
}

function getMarginColor(margin: number) {
  if (margin >= 60) return 'text-green-600'
  if (margin >= 40) return 'text-amber-600'
  if (margin >= 20) return 'text-yellow-600'
  if (margin >= 0) return 'text-red-600'
  return 'text-red-700'
}

export default async function MenuPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const data = await getMenuData(restaurantId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Menu Management</h1>
          <p className="text-slate-500 mt-1">Manage menu items and recipes</p>
        </div>
        <Link href="/dashboard/menu/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Menu Item
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Menu Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.menuItems.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatPercentage(
                data.menuItems.reduce((sum, item) => sum + item.margin, 0) /
                  (data.menuItems.length || 1)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.categories.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Menu Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Image
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Item Name
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Category
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Price
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Cost
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Profit
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Margin
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
                {data.menuItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="h-12 w-16 overflow-hidden rounded-md bg-slate-100">
                        <img
                          src={
                            item.imageUrl ||
                            'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
                          }
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      {item.description && (
                        <div className="text-sm text-slate-500 line-clamp-1">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{item.category.name}</td>
                    <td className="py-3 px-4 text-right font-mono font-medium">
                      {formatCurrency(item.price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(item.cost)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-green-600 font-medium">
                      {formatCurrency(item.profit)}
                    </td>
                    <td className={`py-3 px-4 text-right font-mono font-bold ${getMarginColor(item.margin)}`}>
                      {formatPercentage(item.margin)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          item.available
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {item.available ? 'Available' : 'Unavailable'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/dashboard/menu/${item.id}`}>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.menuItems.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-500">
                  No menu items found. Add your first menu item to get started.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
