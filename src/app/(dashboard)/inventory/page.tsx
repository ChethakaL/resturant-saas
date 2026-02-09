import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { InventoryTable } from '@/app/(dashboard)/inventory/InventoryTable'

const PAGE_SIZE = 25

type IngredientSelectRow = {
  id: string
  name: string
  unit: string
  costPerUnit: number
  supplier: string | null
  preferredSupplierId: string | null
}

async function getInventoryData(restaurantId: string, page: number) {
  const skip = (page - 1) * PAGE_SIZE

  const [totalCount, ingredientsRaw] = await Promise.all([
    prisma.ingredient.count({ where: { restaurantId } }),
    prisma.ingredient.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      skip,
      take: PAGE_SIZE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: {
        id: true,
        name: true,
        unit: true,
        costPerUnit: true,
        supplier: true,
        preferredSupplierId: true,
      } as any,
    }),
  ])
  const ingredients = ingredientsRaw as unknown as IngredientSelectRow[]

  const supplierIds = Array.from(new Set(ingredients.map((i) => i.preferredSupplierId).filter(Boolean))) as string[]
  const suppliers =
    supplierIds.length > 0
      ? await (prisma as any).supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true },
        })
      : []
  const supplierById = Object.fromEntries(suppliers.map((s) => [s.id, s]))

  return {
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      costPerUnit: i.costPerUnit,
      supplier: i.supplier,
      preferredSupplier: i.preferredSupplierId
        ? { id: i.preferredSupplierId, name: supplierById[i.preferredSupplierId]?.name ?? '' }
        : null,
    })),
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
            <InventoryTable
              ingredients={data.ingredients}
              totalCount={data.totalCount}
              totalPages={data.totalPages}
              currentPage={page}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
