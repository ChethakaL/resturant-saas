import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPercentage } from '@/lib/utils'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import BulkMenuImport from '@/components/menu/BulkMenuImport'
import MenuItemsTable from '@/components/menu/MenuItemsTable'

const PAGE_SIZE = 20

async function getMenuData(
  restaurantId: string,
  page: number,
  search?: string
) {
  const skip = (page - 1) * PAGE_SIZE

  const normalizedSearch = search?.trim() ?? ''
  const where: Prisma.MenuItemWhereInput = {
    restaurantId,
    ...(normalizedSearch
      ? {
          name: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        }
      : {}),
  }

  // Run count and paginated fetch in parallel
  const [totalCount, menuItems, categories, ingredients, avgMarginResult, chefPicks] =
    await Promise.all([
      prisma.menuItem.count({ where }),
      prisma.menuItem.findMany({
        where,
        include: {
          category: true,
          ingredients: {
            include: {
              ingredient: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.category.findMany({
        where: { restaurantId },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.ingredient.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
      }),
      // Calculate average margin from all items (lightweight query for summary)
      prisma.menuItem.findMany({
        where,
        select: {
          price: true,
          ingredients: {
            select: {
              quantity: true,
              ingredient: {
                select: { costPerUnit: true },
              },
            },
          },
        },
      }),
      prisma.chefPick.findMany({
        where: { restaurantId },
        orderBy: { displayOrder: 'asc' },
      }),
    ])

  // Calculate cost and margin for paginated items
  const chefPickOrderById = new Map(chefPicks.map((pick) => [pick.menuItemId, pick.displayOrder]))

  const itemsWithMetrics = menuItems.map((item) => {
    const cost = item.ingredients.reduce(
      (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    const margin = item.price > 0 ? ((item.price - cost) / item.price) * 100 : 0

    return {
      ...item,
      cost,
      margin,
      profit: item.price - cost,
      chefPickOrder: chefPickOrderById.get(item.id) ?? null,
    }
  })

  // Calculate average margin from all items
  const allMargins = avgMarginResult.map((item) => {
    const cost = item.ingredients.reduce(
      (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    return item.price > 0 ? ((item.price - cost) / item.price) * 100 : 0
  })
  const avgMargin = allMargins.length > 0
    ? allMargins.reduce((sum, m) => sum + m, 0) / allMargins.length
    : 0

  return {
    menuItems: itemsWithMetrics,
    categories,
    ingredients,
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    avgMargin,
  }
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams?: { page?: string; search?: string | string[] }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId
  const page = Math.max(Number(searchParams?.page || 1), 1)
  const rawSearch = searchParams?.search
  const normalizedSearch =
    typeof rawSearch === 'string'
      ? rawSearch.trim()
      : Array.isArray(rawSearch)
      ? rawSearch[0]?.trim() ?? ''
      : ''

  const data = await getMenuData(restaurantId, page, normalizedSearch)
  const searchQuery = normalizedSearch
    ? `&search=${encodeURIComponent(normalizedSearch)}`
    : ''

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
            <div className="text-2xl font-bold">{data.totalCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatPercentage(data.avgMargin)}
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
          <form
            method="get"
            className="mb-4 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="page" value="1" />
            <div className="flex flex-1 gap-2 min-w-0">
              <Input
                name="search"
                placeholder="Search menu items"
                defaultValue={normalizedSearch}
                className="min-w-0"
              />
              <Button size="sm" type="submit">
                Search
              </Button>
            </div>
            {normalizedSearch && (
              <Link href="/dashboard/menu?page=1">
                <Button variant="outline" size="sm">
                  Clear
                </Button>
              </Link>
            )}
          </form>

          <MenuItemsTable menuItems={data.menuItems} />

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 mt-4">
              <p className="text-sm text-slate-500">
                Page {page} of {data.totalPages} ({data.totalCount} items)
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/menu?page=${Math.max(page - 1, 1)}${searchQuery}`}
                >
                  <Button variant="outline" size="sm" disabled={page <= 1}>
                    Previous
                  </Button>
                </Link>
                <Link
                  href={`/dashboard/menu?page=${Math.min(
                    page + 1,
                    data.totalPages
                  )}${searchQuery}`}
                >
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
