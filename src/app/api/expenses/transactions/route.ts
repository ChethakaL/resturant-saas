import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const expenseTransactionSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['RENT', 'UTILITIES', 'INVENTORY_PURCHASE', 'MARKETING', 'MAINTENANCE', 'OTHER']),
  amount: z.number().positive(),
  date: z.string(),
  notes: z.string().optional(),
  ingredientId: z.string().optional(),
  quantity: z.number().positive().optional(),
  unitCost: z.number().positive().optional(),
})

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {
      restaurantId: session.user.restaurantId,
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const transactions = await prisma.expenseTransaction.findMany({
      where,
      include: {
        ingredient: true,
      },
      orderBy: {
        date: 'desc',
      },
    })

    return NextResponse.json(transactions)
  } catch (error: any) {
    console.error('Error fetching expense transactions:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = expenseTransactionSchema.parse(body)

    // When ingredient + quantity + unitCost are provided (any category), update ingredient stock and cost.
    // This lets "Other - market run" or any expense also update inventory cost when they link an ingredient.
    const hasInventoryLink = data.ingredientId && data.quantity != null && data.quantity > 0 && data.unitCost != null && data.unitCost > 0

    if (hasInventoryLink) {
      const result = await prisma.$transaction(async (tx) => {
        const transaction = await tx.expenseTransaction.create({
          data: {
            name: data.name,
            category: data.category,
            amount: data.amount,
            date: new Date(data.date),
            notes: data.notes,
            ingredientId: data.ingredientId,
            quantity: data.quantity,
            unitCost: data.unitCost,
            restaurantId: session.user.restaurantId,
          },
          include: { ingredient: true },
        })

        const ingredient = await tx.ingredient.findUnique({
          where: { id: data.ingredientId! },
        })

        if (ingredient && ingredient.restaurantId === session.user.restaurantId) {
          const currentTotalValue = ingredient.stockQuantity * ingredient.costPerUnit
          const newTotalValue = data.quantity! * data.unitCost!
          const newTotalQuantity = ingredient.stockQuantity + data.quantity!
          const newAverageCost =
            newTotalQuantity > 0
              ? (currentTotalValue + newTotalValue) / newTotalQuantity
              : data.unitCost!
          const costPerUnitRounded = Math.round(newAverageCost * 100) / 100

          await tx.ingredient.update({
            where: { id: data.ingredientId! },
            data: {
              stockQuantity: newTotalQuantity,
              costPerUnit: costPerUnitRounded,
            },
          })

          await tx.stockAdjustment.create({
            data: {
              ingredientId: data.ingredientId!,
              quantityChange: data.quantity!,
              reason: 'purchase',
              notes: `Expense: ${data.name}`,
            },
          })
        }

        return transaction
      })

      return NextResponse.json(result)
    }

    // Regular expense transaction (no ingredient link)
    const transaction = await prisma.expenseTransaction.create({
      data: {
        name: data.name,
        category: data.category,
        amount: data.amount,
        date: new Date(data.date),
        notes: data.notes,
        restaurantId: session.user.restaurantId,
      },
    })

    return NextResponse.json(transaction)
  } catch (error: any) {
    console.error('Error creating expense transaction:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || 'Failed to create transaction' },
      { status: 500 }
    )
  }
}
