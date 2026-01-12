import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function daysBetweenInclusive(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1
}

function monthsBetweenInclusive(start: Date, end: Date) {
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1
  )
}

function overlapRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  const effectiveStart = start > rangeStart ? start : rangeStart
  const effectiveEnd = end < rangeEnd ? end : rangeEnd
  if (effectiveEnd < effectiveStart) return null
  return { start: effectiveStart, end: effectiveEnd }
}

function expenseTotalForPeriod(
  expense: {
    amount: number
    cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL'
    startDate: Date
    endDate: Date | null
  },
  rangeStart: Date,
  rangeEnd: Date
) {
  const end = expense.endDate || rangeEnd
  const range = overlapRange(expense.startDate, end, rangeStart, rangeEnd)
  if (!range) return 0

  const dayCount = daysBetweenInclusive(range.start, range.end)
  const monthCount = monthsBetweenInclusive(range.start, range.end)

  switch (expense.cadence) {
    case 'DAILY':
      return expense.amount * dayCount
    case 'WEEKLY':
      return expense.amount * (dayCount / 7)
    case 'MONTHLY':
      return expense.amount * monthCount
    case 'ANNUAL':
      return expense.amount * (monthCount / 12)
    default:
      return 0
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 })
    }

    const rangeStart = new Date(startDate)
    const rangeEnd = new Date(endDate)

    const [expenses, expenseTransactions, wasteRecords] = await Promise.all([
      prisma.expense.findMany({
        where: { restaurantId: session.user.restaurantId },
      }),
      prisma.expenseTransaction.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          date: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
      }),
      prisma.wasteRecord.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          date: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
      }),
    ])

    const recurringTotals = expenses.map((expense) => ({
      ...expense,
      total: expenseTotalForPeriod(expense, rangeStart, rangeEnd),
    }))

    const summary = recurringTotals.reduce<Record<string, number>>((acc, exp) => {
      const key = exp.category || 'General'
      acc[key] = (acc[key] || 0) + exp.total
      return acc
    }, {})

    expenseTransactions.forEach((tx) => {
      const category = tx.category === 'OTHER' ? 'Other' : tx.category
      summary[category] = (summary[category] || 0) + tx.amount
    })

    const wasteTotal = wasteRecords.reduce((sum, waste) => sum + waste.cost, 0)
    if (wasteTotal > 0) {
      summary['Waste'] = (summary['Waste'] || 0) + wasteTotal
    }

    return NextResponse.json(summary)
  } catch (error: any) {
    console.error('Error fetching expenses by category:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch expenses by category' },
      { status: 500 }
    )
  }
}
