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
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const daysParam = searchParams.get('days')

    let startDate: Date
    let endDate: Date

    if (startDateParam && endDateParam) {
      // Use provided date range
      startDate = new Date(startDateParam)
      endDate = new Date(endDateParam)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
    } else {
      // Fallback to days parameter
      const days = parseInt(daysParam || '30')
      endDate = new Date()
      startDate = new Date()
      startDate.setDate(endDate.getDate() - days)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
    }

    // Fetch all data sources
    const [
      sales,
      mealPrepSessions,
      expenses,
      expenseTransactions,
      wasteRecords,
      payrolls,
    ] = await Promise.all([
      // Sales
      prisma.sale.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          status: 'COMPLETED',
          timestamp: { gte: startDate, lte: endDate },
        },
        include: {
          items: true,
        },
      }),
      // Meal prep sessions
      prisma.mealPrepSession.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          prepDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          inventoryUsages: {
            include: {
              ingredient: true,
            },
          },
        },
      }),
      // Recurring expenses
      prisma.expense.findMany({
        where: {
          restaurantId: session.user.restaurantId,
        },
      }),
      // One-time expense transactions
      prisma.expenseTransaction.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
      // Waste records
      prisma.wasteRecord.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
      // Payroll
      prisma.payroll.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          status: 'PAID',
          OR: [
            {
              paidDate: {
                gte: startDate,
                lte: endDate,
              },
            },
            {
              period: {
                gte: startDate,
                lte: endDate,
              },
            },
          ],
        },
      }),
    ])

    // Calculate recurring expense totals for the period
    const recurringExpenseTotal = expenses.reduce((sum, expense) => {
      return sum + expenseTotalForPeriod(expense, startDate, endDate)
    }, 0)

    const periodDays = daysBetweenInclusive(startDate, endDate)
    const dailyRecurringExpense = periodDays > 0 ? recurringExpenseTotal / periodDays : 0

    // Group data by day
    const dailyData = new Map<string, {
      revenue: number
      cogs: number
      expenses: number
      payroll: number
      netProfit: number
      margin: number
    }>()

    // Initialize all days in the date range
    const rangeDays = daysBetweenInclusive(startDate, endDate)
    for (let i = 0; i < rangeDays; i++) {
      const day = new Date(startDate)
      day.setDate(startDate.getDate() + i)
      const key = day.toISOString().split('T')[0]
      dailyData.set(key, {
        revenue: 0,
        cogs: 0,
        expenses: dailyRecurringExpense,
        payroll: 0,
        netProfit: 0,
        margin: 0,
      })
    }

    // Add sales revenue and COGS
    sales.forEach((sale) => {
      const key = sale.timestamp.toISOString().split('T')[0]
      const day = dailyData.get(key)
      if (day) {
        day.revenue += sale.total
        const saleCOGS = sale.items.reduce(
          (sum, item) => sum + item.cost * item.quantity,
          0
        )
        day.cogs += saleCOGS
      }
    })

    // Add meal prep COGS
    mealPrepSessions.forEach((session) => {
      const key = session.prepDate.toISOString().split('T')[0]
      const day = dailyData.get(key)
      if (day) {
        const prepCOGS = session.inventoryUsages.reduce(
          (sum, usage) => sum + usage.quantityUsed * usage.ingredient.costPerUnit,
          0
        )
        day.cogs += prepCOGS
      }
    })

    // Add one-time expenses
    // Exclude expense transactions that are from waste records (they're already counted in wasteRecords)
    expenseTransactions.forEach((tx) => {
      // Skip expense transactions created from waste records (they have "Waste record:" in notes)
      if (tx.notes?.includes('Waste record:')) {
        return // Skip this transaction - it's already counted in wasteRecords
      }
      
      const key = tx.date.toISOString().split('T')[0]
      const day = dailyData.get(key)
      if (day) {
        day.expenses += tx.amount
      }
    })

    // Add waste costs (these are NOT in expenseTransactions - they're separate waste records)
    wasteRecords.forEach((waste) => {
      const key = waste.date.toISOString().split('T')[0]
      const day = dailyData.get(key)
      if (day) {
        day.expenses += waste.cost
      }
    })

    // Add payroll (distribute across days in period)
    const totalPayroll = payrolls.reduce((sum, p) => sum + p.totalPaid, 0)
    const dailyPayroll = periodDays > 0 ? totalPayroll / periodDays : 0
    dailyData.forEach((day) => {
      day.payroll = dailyPayroll
    })

    // Calculate net profit and margin for each day
    const result = Array.from(dailyData.entries())
      .map(([date, data]) => {
        const grossProfit = data.revenue - data.cogs
        const netProfit = grossProfit - data.expenses - data.payroll
        const margin = data.revenue > 0 ? (netProfit / data.revenue) * 100 : 0

        return {
          date,
          revenue: data.revenue,
          margin,
          netProfit,
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error fetching daily revenue and margin:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch data' },
      { status: 500 }
    )
  }
}
