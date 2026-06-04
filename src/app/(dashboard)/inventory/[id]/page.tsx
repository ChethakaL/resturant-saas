import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import IngredientEditForm from './IngredientEditForm'

type PurchaseHistoryEntry = {
  id: string
  source: 'delivery' | 'expense'
  date: string
  supplier: string | null
  quantity: number | null
  unit: string
  totalPrice: number
  unitCost: number
  notes: string | null
  receiptImageUrl: string | null
}

async function getIngredient(id: string, restaurantId: string) {
  const ingredient = await prisma.ingredient.findFirst({
    where: {
      id,
      restaurantId,
    },
    include: {
      pnlCategory: true,
      variants: true,
      stockAdjustments: {
        orderBy: { timestamp: 'desc' },
        take: 10,
      },
    },
  })

  return ingredient
}

async function getPurchaseHistory(ingredientId: string, restaurantId: string, unit: string): Promise<PurchaseHistoryEntry[]> {
  const [deliveries, expenseTransactions] = await Promise.all([
    prisma.delivery.findMany({
      where: {
        ingredientId,
        restaurantId,
      },
      select: {
        id: true,
        supplierName: true,
        quantity: true,
        unitCost: true,
        totalCost: true,
        deliveryDate: true,
        notes: true,
        expenseTransactionId: true,
        expenseTransaction: {
          select: {
            receiptId: true,
          },
        },
      },
      orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.expenseTransaction.findMany({
      where: {
        ingredientId,
        restaurantId,
        category: 'INVENTORY_PURCHASE',
        unitCost: { not: null },
      },
      select: {
        id: true,
        name: true,
        amount: true,
        date: true,
        notes: true,
        quantity: true,
        unitCost: true,
        receiptId: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
  ])

  const linkedExpenseIds = new Set(
    deliveries
      .map((delivery) => delivery.expenseTransactionId)
      .filter((value): value is string => Boolean(value))
  )

  const receiptIds = expenseTransactions
    .map((transaction) => transaction.receiptId)
    .filter((value): value is string => Boolean(value))

  const receipts =
    receiptIds.length > 0
      ? await prisma.receipt.findMany({
          where: {
            id: { in: receiptIds },
            restaurantId,
          },
          select: {
            id: true,
            imageUrl: true,
            supplier: true,
          },
        })
      : []

  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))

  const deliveryEntries: PurchaseHistoryEntry[] = deliveries.map((delivery) => ({
    id: `delivery-${delivery.id}`,
    source: 'delivery',
    date: delivery.deliveryDate.toISOString(),
    supplier: delivery.supplierName,
    quantity: delivery.quantity,
    unit,
    totalPrice: delivery.totalCost,
    unitCost: delivery.unitCost,
    notes: delivery.notes,
    receiptImageUrl: delivery.expenseTransaction?.receiptId
      ? receiptById.get(delivery.expenseTransaction.receiptId)?.imageUrl ?? null
      : null,
  }))

  const expenseEntries: PurchaseHistoryEntry[] = expenseTransactions
    .filter((transaction) => !linkedExpenseIds.has(transaction.id))
    .map((transaction) => {
      const receipt = transaction.receiptId ? receiptById.get(transaction.receiptId) : null
      const supplierFromName = transaction.name.match(/\(([^)]+)\)\s*$/)?.[1] ?? null

      return {
        id: `expense-${transaction.id}`,
        source: 'expense' as const,
        date: transaction.date.toISOString(),
        supplier: receipt?.supplier ?? supplierFromName,
        quantity: transaction.quantity ?? null,
        unit,
        totalPrice: transaction.amount,
        unitCost: transaction.unitCost ?? 0,
        notes: transaction.notes,
        receiptImageUrl: receipt?.imageUrl ?? null,
      }
    })

  return [...deliveryEntries, ...expenseEntries].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
  )
}

export default async function IngredientEditPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  // Handle both Promise and direct params (Next.js 15 compatibility)
  const resolvedParams = params instanceof Promise ? await params : params
  const ingredient = await getIngredient(resolvedParams.id, restaurantId)

  if (!ingredient) {
    notFound()
  }

  const purchaseHistory = await getPurchaseHistory(ingredient.id, restaurantId, ingredient.unit)

  return <IngredientEditForm ingredient={ingredient} purchaseHistory={purchaseHistory} />
}
