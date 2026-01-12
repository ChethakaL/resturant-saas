import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const recurringExpenseSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  amount: z.number().positive(),
  cadence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL']),
  startDate: z.string(),
  endDate: z.string().optional(),
})

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const expense = await prisma.expense.findUnique({
      where: { id: params.id },
    })

    if (!expense || expense.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    return NextResponse.json(expense)
  } catch (error: any) {
    console.error('Error fetching recurring expense:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch expense' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const expense = await prisma.expense.findUnique({
      where: { id: params.id },
    })

    if (!expense || expense.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    const body = await request.json()
    const data = recurringExpenseSchema.parse(body)

    const updated = await prisma.expense.update({
      where: { id: params.id },
      data: {
        name: data.name,
        category: data.category || null,
        amount: data.amount,
        cadence: data.cadence,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating recurring expense:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || 'Failed to update expense' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const expense = await prisma.expense.findUnique({
      where: { id: params.id },
    })

    if (!expense || expense.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    const today = new Date()
    const updated = await prisma.expense.update({
      where: { id: params.id },
      data: {
        endDate: expense.endDate && expense.endDate < today ? expense.endDate : today,
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error deleting recurring expense:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete expense' },
      { status: 500 }
    )
  }
}
