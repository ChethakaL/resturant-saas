import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const expenseUpdateSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['RENT', 'UTILITIES', 'INVENTORY_PURCHASE', 'MARKETING', 'MAINTENANCE', 'OTHER']),
  amount: z.number().positive(),
  date: z.string(),
  notes: z.string().optional(),
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

    const transaction = await prisma.expenseTransaction.findUnique({
      where: { id: params.id },
      include: {
        ingredient: true,
      },
    })

    if (!transaction || transaction.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    return NextResponse.json(transaction)
  } catch (error: any) {
    console.error('Error fetching expense transaction:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch transaction' },
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

    const transaction = await prisma.expenseTransaction.findUnique({
      where: { id: params.id },
    })

    if (!transaction || transaction.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (transaction.category === 'INVENTORY_PURCHASE') {
      return NextResponse.json(
        { error: 'Inventory purchase edits are not supported yet' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const data = expenseUpdateSchema.parse(body)

    if (data.category === 'INVENTORY_PURCHASE') {
      return NextResponse.json(
        { error: 'Inventory purchase edits are not supported yet' },
        { status: 400 }
      )
    }

    const updated = await prisma.expenseTransaction.update({
      where: { id: params.id },
      data: {
        name: data.name,
        category: data.category,
        amount: data.amount,
        date: new Date(data.date),
        notes: data.notes,
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating expense transaction:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || 'Failed to update transaction' },
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

    const transaction = await prisma.expenseTransaction.findUnique({
      where: { id: params.id },
    })

    if (!transaction || transaction.restaurantId !== session.user.restaurantId) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // If this was an inventory purchase, we should reverse the stock update
    // For now, we'll just delete the transaction (in production, you might want to handle this differently)
    await prisma.expenseTransaction.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting expense transaction:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete transaction' },
      { status: 500 }
    )
  }
}
