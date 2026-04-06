import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getServerTranslations } from '@/lib/i18n/server'
import { translateInventoryTableRows } from '@/lib/i18n/inventory-display-translate'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { InventoryTable } from '@/app/(dashboard)/inventory/InventoryTable'
import { InventorySearch } from '@/app/(dashboard)/inventory/InventorySearch'
import FixUnitsButton from '@/app/(dashboard)/inventory/FixUnitsButton'
import { isAllowedUnit, canonicalise } from '@/lib/unit-converter'
import UploadReceiptButton from './UploadReceiptButton'
import { SupplierDirectoryButton } from './SupplierDirectoryButton'
import { DEFAULT_INVENTORY_CATEGORY, isInventoryCategory } from '@/lib/inventory-categories'

const PAGE_SIZE = 25

type IngredientSelectRow = {
  id: string
  name: string
  category: string
  unit: string
  costPerUnit: number
  supplier: string | null
  preferredSupplierId: string | null
  variants: {
    id: number | string
    brand: string
    supplier: string | null
    purchaseFormat: string | null
    packageQuantity: number | null
    packageUnit: string
    bulkPrice: number | null
    costPerUnit: number
  }[]
}

type PurchaseTrend = {
  latestUnitCost: number | null
  previousUnitCost: number | null
  percentChange: number | null
}

async function getPurchaseTrendByIngredient(
  restaurantId: string,
  ingredientIds: string[]
): Promise<Map<string, PurchaseTrend>> {
  if (ingredientIds.length === 0) {
    return new Map()
  }

  const [deliveries, expenseTransactions] = await Promise.all([
    prisma.delivery.findMany({
      where: {
        restaurantId,
        ingredientId: { in: ingredientIds },
      },
      select: {
        ingredientId: true,
        unitCost: true,
        deliveryDate: true,
        expenseTransactionId: true,
      },
      orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.expenseTransaction.findMany({
      where: {
        restaurantId,
        ingredientId: { in: ingredientIds },
        category: 'INVENTORY_PURCHASE',
        unitCost: { not: null },
      },
      select: {
        id: true,
        ingredientId: true,
        unitCost: true,
        date: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
  ])

  const linkedExpenseIds = new Set(
    deliveries
      .map((delivery) => delivery.expenseTransactionId)
      .filter((value): value is string => Boolean(value))
  )

  const grouped = new Map<string, { unitCost: number; date: Date }[]>()

  const pushEntry = (ingredientId: string | null, unitCost: number | null, date: Date) => {
    if (!ingredientId || unitCost == null) return
    const current = grouped.get(ingredientId) ?? []
    current.push({ unitCost, date })
    grouped.set(ingredientId, current)
  }

  deliveries.forEach((delivery) => {
    pushEntry(delivery.ingredientId, delivery.unitCost, delivery.deliveryDate)
  })

  expenseTransactions
    .filter((transaction) => !linkedExpenseIds.has(transaction.id))
    .forEach((transaction) => {
      pushEntry(transaction.ingredientId, transaction.unitCost, transaction.date)
    })

  const trends = new Map<string, PurchaseTrend>()

  ingredientIds.forEach((ingredientId) => {
    const entries = (grouped.get(ingredientId) ?? []).sort(
      (left, right) => right.date.getTime() - left.date.getTime()
    )
    const latest = entries[0]?.unitCost ?? null
    const previous = entries[1]?.unitCost ?? null
    const percentChange =
      latest != null && previous != null && previous > 0
        ? ((latest - previous) / previous) * 100
        : null

    trends.set(ingredientId, {
      latestUnitCost: latest,
      previousUnitCost: previous,
      percentChange,
    })
  })

  return trends
}

async function getInventoryData(
  restaurantId: string,
  page: number,
  query?: string,
  category?: string,
  sort?: string
) {
  const skip = (page - 1) * PAGE_SIZE
  const normalizedCategory = isInventoryCategory(category) ? category : undefined
  const orderBy =
    sort === 'cost_desc'
      ? [{ costPerUnit: 'desc' as const }, { name: 'asc' as const }]
      : sort === 'cost_asc'
        ? [{ costPerUnit: 'asc' as const }, { name: 'asc' as const }]
        : sort === 'name_desc'
          ? [{ name: 'desc' as const }]
          : [{ category: 'asc' as const }, { name: 'asc' as const }]

  const where = {
    restaurantId,
    ...(normalizedCategory && { category: normalizedCategory }),
    ...(query && {
      OR: [
        { name: { contains: query, mode: 'insensitive' as const } },
        { supplier: { contains: query, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [totalCount, ingredientsRaw] = await Promise.all([
    prisma.ingredient.count({ where }),
    prisma.ingredient.findMany({
      where,
      orderBy,
      skip,
      take: PAGE_SIZE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: {
        id: true,
        name: true,
        category: true,
        unit: true,
        costPerUnit: true,
        supplier: true,
        preferredSupplierId: true,
        variants: {
          select: {
            id: true,
            brand: true,
            supplier: true,
            purchaseFormat: true,
            packageQuantity: true,
            packageUnit: true,
            bulkPrice: true,
            costPerUnit: true,
          },
        },
      } as any,
    }),
  ])
  const ingredients = ingredientsRaw as unknown as IngredientSelectRow[]
  const trendByIngredient = await getPurchaseTrendByIngredient(
    restaurantId,
    ingredients.map((ingredient) => ingredient.id)
  )

  const supplierIds = Array.from(new Set(ingredients.map((i) => i.preferredSupplierId).filter(Boolean))) as string[]
  const suppliers =
    supplierIds.length > 0
      ? await (prisma as any).supplier.findMany({
        where: { id: { in: supplierIds } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          whatsapp: true,
          leadTimeDays: true,
          deliveryDays: true,
        },
      })
      : []
  const supplierById = Object.fromEntries(suppliers.map((s) => [s.id, s]))

  return {
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category || DEFAULT_INVENTORY_CATEGORY,
      unit: i.unit,
      costPerUnit: i.variants?.length > 0 ? i.variants[0].costPerUnit : i.costPerUnit,
      supplier: i.variants?.length > 0 ? i.variants[0].supplier : i.supplier,
      preferredSupplier: i.preferredSupplierId
        ? {
            id: i.preferredSupplierId,
            name: supplierById[i.preferredSupplierId]?.name ?? '',
            email: supplierById[i.preferredSupplierId]?.email ?? null,
            phone: supplierById[i.preferredSupplierId]?.phone ?? null,
            whatsapp: supplierById[i.preferredSupplierId]?.whatsapp ?? null,
            leadTimeDays: supplierById[i.preferredSupplierId]?.leadTimeDays ?? null,
            deliveryDays: supplierById[i.preferredSupplierId]?.deliveryDays ?? [],
          }
        : null,
      purchaseTrend: trendByIngredient.get(i.id) ?? {
        latestUnitCost: null,
        previousUnitCost: null,
        percentChange: null,
      },
    })),
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  }
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: { page?: string; q?: string; category?: string; sort?: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId
  const page = Math.max(Number(searchParams?.page || 1), 1)
  const query = searchParams?.q
  const category = searchParams?.category
  const sort = searchParams?.sort

  const data = await getInventoryData(restaurantId, page, query, category, sort)

  const { locale: managementLocale, t } = await getServerTranslations()
  const displayIngredients = await translateInventoryTableRows(data.ingredients, managementLocale)

  // Count ingredients with non-standard units across the whole restaurant (not just this page)
  const allUnits = await prisma.ingredient.findMany({
    where: { restaurantId },
    select: { unit: true },
  })
  const badUnitCount = allUnits.filter((i) => !isAllowedUnit(canonicalise(i.unit))).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t.inventory_title}</h1>
          <p className="text-slate-500 mt-1">{t.inventory_subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <InventorySearch />

          <UploadReceiptButton />

          <SupplierDirectoryButton />

          <Link href="/inventory/new">
            <Button className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              {t.inventory_add_ingredient}
            </Button>
          </Link>
        </div>
      </div>

      {/* Bad-unit warning banner */}
      {badUnitCount > 0 && <FixUnitsButton badUnitCount={badUnitCount} />}

      {/* Ingredients Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t.inventory_all_ingredients}</CardTitle>
          <p className="text-sm text-slate-500 font-normal mt-1">
            {t.inventory_cost_note}
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <InventoryTable
              ingredients={displayIngredients}
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
