import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatPercentage } from '@/lib/utils'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import BulkMenuImport from '@/components/menu/BulkMenuImport'
import MenuItemsTable from '@/components/menu/MenuItemsTable'

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

  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId },
    orderBy: { name: 'asc' },
  })

  return {
    menuItems: itemsWithMetrics,
    categories,
    ingredients,
  }
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
        <div className="flex gap-2">
          <BulkMenuImport categories={data.categories} ingredients={data.ingredients} />
          <Link href="/dashboard/menu/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Menu Item
            </Button>
          </Link>
        </div>
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
          <MenuItemsTable menuItems={data.menuItems} />
        </CardContent>
      </Card>
    </div>
  )
}
