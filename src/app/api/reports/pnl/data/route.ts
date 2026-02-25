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
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')
    const branchId = searchParams.get('branchId')

    const now = new Date()
    const rangeStart = startParam ? new Date(startParam) : new Date(now.getFullYear(), now.getMonth(), 1)
    const rangeEnd = endParam ? new Date(endParam) : now

    // Build branch filter for sales
    const branchFilter: Record<string, unknown> = {}
    if (branchId) {
      if (branchId === 'unassigned') {
        branchFilter.branchId = null
      } else {
        branchFilter.branchId = branchId
      }
    }

    // Fetch all data sources
    const [sales, expenses, payrolls, expenseTransactions, wasteRecords, mealPrepSessions] = await Promise.all([
      // Sales/Revenue (filtered by branch if specified)
      prisma.sale.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          status: 'COMPLETED',
          timestamp: { gte: rangeStart, lte: rangeEnd },
          ...branchFilter,
        },
        include: {
          items: {
            include: {
              menuItem: {
                include: {
                  category: true,
                },
              },
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
      // Payroll
      prisma.payroll.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          status: 'PAID',
          OR: [
            {
              paidDate: {
                gte: rangeStart,
                lte: rangeEnd,
              },
            },
            {
              period: {
                gte: rangeStart,
                lte: rangeEnd,
              },
            },
          ],
        },
        include: {
          employee: true,
        },
      }),
      // One-time expense transactions
      prisma.expenseTransaction.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          date: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
        include: {
          ingredient: true,
        },
      }),
      // Waste records
      prisma.wasteRecord.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          date: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
        include: {
          ingredient: true,
        },
      }),
      // Meal prep sessions (for COGS calculation)
      prisma.mealPrepSession.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          prepDate: {
            gte: rangeStart,
            lte: rangeEnd,
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

    // Calculate revenue
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0)

    // Revenue from items with complete costing (cost is set and numeric) for COGS coverage %
    let revenueWithCosting = 0
    sales.forEach((sale) => {
      sale.items.forEach((item: { price: number; quantity: number; cost: number | null }) => {
        const itemRevenue = item.price * item.quantity
        const hasCosting = typeof item.cost === 'number' && item.cost >= 0
        if (hasCosting) revenueWithCosting += itemRevenue
      })
    })
    const cogsCoveragePercent =
      totalRevenue > 0 ? Math.round((revenueWithCosting / totalRevenue) * 100) : 100

    // Calculate COGS from sales (ingredients used in completed orders)
    const totalCOGS = sales.reduce(
      (sum, sale) =>
        sum + sale.items.reduce((sub, item) => sub + item.cost * item.quantity, 0),
      0
    )

    // Calculate meal prep costs (ingredients used in prep, even if not sold)
    const mealPrepCOGS = mealPrepSessions.reduce((sum, session) => {
      return sum + session.inventoryUsages.reduce((sessionSum, usage) => {
        return sessionSum + (usage.quantityUsed * usage.ingredient.costPerUnit)
      }, 0)
    }, 0)

    // Calculate COGS from manual stock adjustments (expense transactions with COGS notes)
    const manualAdjustmentCOGS = expenseTransactions
      .filter((tx) => tx.notes?.includes('COGS') || tx.notes?.includes('Manual stock adjustment'))
      .reduce((sum, tx) => sum + tx.amount, 0)

    // Total COGS includes sales COGS, meal prep COGS, and manual adjustments
    const totalCOGSWithPrep = totalCOGS + mealPrepCOGS + manualAdjustmentCOGS

    const grossProfit = totalRevenue - totalCOGSWithPrep

    // Calculate payroll
    const payrollTotal = payrolls.reduce((sum, payroll) => sum + payroll.totalPaid, 0)

    // Calculate recurring expenses
    const expenseTotals = expenses.map((expense) => ({
      ...expense,
      total: expenseTotalForPeriod(expense, rangeStart, rangeEnd),
    }))

    const expenseByCategory = expenseTotals.reduce<Record<string, number>>((acc, exp) => {
      const key = exp.category || 'General'
      acc[key] = (acc[key] || 0) + exp.total
      return acc
    }, {})

    // Add one-time expense transactions by category
    // Exclude expense transactions that are from waste records (they're already counted in wasteRecords)
    let deliveryCOGS = 0
    expenseTransactions.forEach((tx) => {
      // Skip expense transactions created from waste records (they have "Waste record:" in notes)
      if (tx.notes?.includes('Waste record:')) {
        return // Skip this transaction - it's already counted in wasteRecords
      }

      // Check if this is a COGS entry (from manual stock adjustments)
      const isCOGS = tx.notes?.includes('COGS') || tx.notes?.includes('Manual stock adjustment')
      const isDelivery = tx.category === 'INVENTORY_PURCHASE'
      const category = isCOGS
        ? 'COGS'
        : tx.category === 'OTHER'
          ? 'Other'
          : tx.category
      expenseByCategory[category] = (expenseByCategory[category] || 0) + tx.amount

      if (isDelivery) {
        deliveryCOGS += tx.amount
      }

      // If it's COGS, also add to total COGS
      if (isCOGS) {
        // This will be included in the COGS calculation
      }
    })

    if (deliveryCOGS > 0) {
      expenseByCategory['COGS (Deliveries)'] = deliveryCOGS
    }

    // Add waste costs (these are NOT in expenseTransactions - they're separate waste records)
    const wasteTotal = wasteRecords.reduce((sum, waste) => sum + waste.cost, 0)
    if (wasteTotal > 0) {
      expenseByCategory['Waste'] = (expenseByCategory['Waste'] || 0) + wasteTotal
    }

    const totalExpenses = Object.values(expenseByCategory).reduce(
      (sum, value) => sum + value,
      0
    )

    const netProfit = grossProfit - totalExpenses - payrollTotal

    return NextResponse.json({
      summary: {
        revenue: totalRevenue,
        cogs: totalCOGSWithPrep,
        cogsFromSales: totalCOGS,
        cogsFromMealPrep: mealPrepCOGS,
        cogsFromManualAdjustments: manualAdjustmentCOGS,
        grossProfit,
        expenses: totalExpenses,
        payroll: payrollTotal,
        netProfit,
        cogsCoveragePercent,
        revenueWithCosting,
      },
      expenseByCategory,
      expenseTransactions,
      wasteRecords,
      mealPrepSessions: mealPrepSessions.map((s) => ({
        id: s.id,
        prepDate: s.prepDate,
        sessionTime: s.sessionTime,
        preparedBy: s.preparedBy,
        totalCost: s.inventoryUsages.reduce((sum, usage) =>
          sum + (usage.quantityUsed * usage.ingredient.costPerUnit), 0
        ),
      })),
      expenses: expenses.map((exp) => ({
        id: exp.id,
        name: exp.name,
        category: exp.category,
        amount: exp.amount,
        cadence: exp.cadence,
        startDate: exp.startDate,
        endDate: exp.endDate,
      })),
      payrolls: payrolls.map((p) => ({
        id: p.id,
        period: p.period,
        paidDate: p.paidDate,
        totalPaid: p.totalPaid,
        notes: p.notes,
        employee: p.employee ? { id: p.employee.id, name: p.employee.name } : null,
      })),
      sales: sales.map((s) => ({
        id: s.id,
        orderNumber: s.orderNumber,
        total: s.total,
        timestamp: s.timestamp,
        items: s.items.map((i: any) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          price: i.price,
          cost: i.cost,
          menuItem: i.menuItem ? {
            id: i.menuItem.id,
            name: i.menuItem.name,
            category: i.menuItem.category ? {
              id: i.menuItem.category.id,
              name: i.menuItem.category.name,
            } : null,
          } : null,
        })),
      })),
    })
  } catch (error: any) {
    console.error('Error fetching P&L data:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch P&L data' },
      { status: 500 }
    )
  }
}
