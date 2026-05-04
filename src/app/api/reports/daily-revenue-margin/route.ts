import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getMonthlySalesImports } from '@/lib/monthly-sales-import'
import { listMonthlyFinancialImports } from '@/lib/monthly-financial-import-store'

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

function getDaysInMonth(year: number, monthIndexZeroBased: number) {
  return new Date(year, monthIndexZeroBased + 1, 0).getDate()
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

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })
    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    
    const dbImports = await listMonthlyFinancialImports(session.user.restaurantId)
    const allImports = dbImports.length > 0 ? dbImports : getMonthlySalesImports(settings)
    const importedDailyStats = new Map<string, { revenue: number; margin: number; netProfit: number }>()
    
    for (const imp of allImports) {
      const monthlyRevenue = Number(imp?.summary?.totalSales || 0)
      const monthlyNetProfit = Number(imp?.summary?.netSales || (monthlyRevenue - Number(imp?.summary?.totalExpenses || 0)))
      const hasDailyRows = Array.isArray(imp.dailySales) && imp.dailySales.length > 0

      if (hasDailyRows) {
        imp.dailySales.forEach((row: any) => {
          const date = new Date(`${row.date}T00:00:00`)
          if (date >= startDate && date <= endDate) {
            const key = row.date
            const current = importedDailyStats.get(key) || { revenue: 0, margin: 0, netProfit: 0 }
            const rowRevenue = Number(row.netSales || row.grossSales || 0)
            const rowNetProfit = Number(row.netProfit || rowRevenue)
            importedDailyStats.set(key, {
              revenue: current.revenue + rowRevenue,
              margin: row.margin || 0,
              netProfit: current.netProfit + rowNetProfit,
            })
          }
        })
        continue
      }

      // If the PDF has only monthly summary data, distribute monthly totals across days
      // so Jan -> today charts still include that month.
      if (
        Number.isInteger(imp?.year) &&
        Number.isInteger(imp?.month) &&
        imp.month >= 1 &&
        imp.month <= 12 &&
        monthlyRevenue > 0
      ) {
        const monthStart = new Date(imp.year, imp.month - 1, 1)
        const monthEnd = new Date(imp.year, imp.month, 0, 23, 59, 59, 999)
        const effectiveStart = monthStart > startDate ? monthStart : startDate
        const effectiveEnd = monthEnd < endDate ? monthEnd : endDate
        if (effectiveEnd < effectiveStart) continue

        const daysInMonth = getDaysInMonth(imp.year, imp.month - 1)
        const dailyRevenue = monthlyRevenue / daysInMonth
        const dailyNetProfit = monthlyNetProfit / daysInMonth

        const cursor = new Date(effectiveStart)
        cursor.setHours(0, 0, 0, 0)
        while (cursor <= effectiveEnd) {
          const key = cursor.toISOString().split('T')[0]
          const current = importedDailyStats.get(key) || { revenue: 0, margin: 0, netProfit: 0 }
          importedDailyStats.set(key, {
            revenue: current.revenue + dailyRevenue,
            margin: 0,
            netProfit: current.netProfit + dailyNetProfit,
          })
          cursor.setDate(cursor.getDate() + 1)
        }
      }
    }

    // Fetch aggregated metrics using SQL views (fast) + meal prep COGS.
    const [salesAgg, expenseAgg, mealPrepSessions] = await Promise.all([
      prisma.$queryRaw<Array<{ day: Date; revenue: number; cogs: number; orders: number }>>`
        SELECT day, revenue, cogs, orders
        FROM vw_daily_sales_metrics
        WHERE restaurant_id = ${session.user.restaurantId}
          AND day >= ${startDate}
          AND day <= ${endDate}
      `,
      prisma.$queryRaw<Array<{ day: Date; expenses: number }>>`
        SELECT day, expenses
        FROM vw_daily_expense_metrics
        WHERE restaurant_id = ${session.user.restaurantId}
          AND day >= ${startDate}
          AND day <= ${endDate}
      `,
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
    ])

    // DISABLED for now: recurring expenses (e.g. rent). Re-enable when full P&L is needed.
    // const recurringExpenseTotal = expenses.reduce((sum, expense) => {
    //   return sum + expenseTotalForPeriod(expense, startDate, endDate)
    // }, 0)
    const dailyRecurringExpense = 0

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

    // Add aggregated sales revenue and COGS from SQL view
    salesAgg.forEach((row) => {
      const key = new Date(row.day).toISOString().split('T')[0]
      const day = dailyData.get(key)
      if (day) {
        day.revenue += Number(row.revenue || 0)
        day.cogs += Number(row.cogs || 0)
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

    // Add aggregated inventory + waste expenses from SQL view
    expenseAgg.forEach((row) => {
      const key = new Date(row.day).toISOString().split('T')[0]
      const day = dailyData.get(key)
      if (day) {
        day.expenses += Number(row.expenses || 0)
      }
    })

    // DISABLED for now: payroll (HR). Re-enable when full P&L is needed.
    // const totalPayroll = payrolls.reduce((sum, p) => sum + p.totalPaid, 0)
    const dailyPayroll = 0
    dailyData.forEach((day) => {
      day.payroll = dailyPayroll
    })

    // Merge imported data with live daily data
    importedDailyStats.forEach((imp, date) => {
      const live = dailyData.get(date)
      if (live) {
        live.revenue += imp.revenue
        live.netProfit += imp.netProfit
        // For margin, we'll recalculate at the end
      } else {
        dailyData.set(date, {
          revenue: imp.revenue,
          cogs: 0,
          expenses: 0,
          payroll: 0,
          netProfit: imp.netProfit,
          margin: 0,
        })
      }
    })

    // Calculate net profit and margin for each day
    const result = Array.from(dailyData.entries())
      .map(([date, data]) => {
        const grossProfit = data.revenue - data.cogs
        const netProfit = data.netProfit || (grossProfit - data.expenses - data.payroll)
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
