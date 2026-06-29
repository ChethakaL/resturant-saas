import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/platform-config'
import { requireRestaurantFeature } from '@/lib/require-product-feature'

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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1)
}

function accruedFixedExpenseTotalForPeriod(
  expense: {
    amount: number
    cadence: 'MONTHLY' | 'ANNUAL'
    startDate: Date
    endDate: Date | null
  },
  rangeStart: Date,
  rangeEnd: Date,
  today: Date,
  operatingDaysInMonth: number
) {
  const effectiveReportEnd = rangeEnd > today ? today : rangeEnd
  const expenseEnd = expense.endDate && expense.endDate < effectiveReportEnd ? expense.endDate : effectiveReportEnd
  const range = overlapRange(expense.startDate, expenseEnd, rangeStart, effectiveReportEnd)
  if (!range) return 0

  const monthlyAmount = expense.cadence === 'ANNUAL' ? expense.amount / 12 : expense.amount
  let total = 0
  let cursor = startOfMonth(range.start)

  while (cursor <= range.end) {
    const monthRange = overlapRange(cursor, endOfMonth(cursor), range.start, range.end)
    if (monthRange) {
      const recognizedDays = Math.min(
        operatingDaysInMonth,
        daysBetweenInclusive(monthRange.start, monthRange.end)
      )

      total += monthlyAmount * (recognizedDays / operatingDaysInMonth)
    }

    cursor = addMonths(cursor, 1)
  }

  return total
}

function percentOf(amount: number, base: number) {
  return base > 0 ? (amount / base) * 100 : 0
}

function readLivePnlConfig(
  settings: unknown,
  platformConfig: {
    livePnlSalesTaxRate?: number
    livePnlProfitTaxRate?: number
    livePnlServiceChargeRate?: number
    livePnlOperatingDaysInMonth?: number
    livePnlCurrency?: string
    livePnlUsdRate?: number
  }
) {
  const config =
    settings && typeof settings === 'object' && 'livePnl' in settings
      ? (settings as { livePnl?: Record<string, unknown> }).livePnl
      : null

  const numberValue = (key: string, fallback: number) => {
    const value = config?.[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }

  const operatingDaysInMonth = Math.max(
    1,
    Math.min(31, numberValue('operatingDaysInMonth', platformConfig.livePnlOperatingDaysInMonth ?? 30))
  )

  return {
    salesTaxRate: numberValue('salesTaxRate', platformConfig.livePnlSalesTaxRate ?? 10),
    profitTaxRate: numberValue('profitTaxRate', platformConfig.livePnlProfitTaxRate ?? 5),
    serviceChargeRate: numberValue('serviceChargeRate', platformConfig.livePnlServiceChargeRate ?? 0),
    operatingDaysInMonth,
    currency: typeof config?.currency === 'string' ? config.currency : platformConfig.livePnlCurrency || 'IQD',
    usdRate: numberValue('usdRate', platformConfig.livePnlUsdRate ?? 0),
  }
}

function expenseBucket(category?: string | null, name?: string | null) {
  const label = `${category || ''} ${name || ''}`.toLowerCase()
  if (label.includes('rent') || label.includes('insurance') || label.includes('depreciation')) {
    return 'occupancy'
  }
  return 'controllable'
}

function itemTaxRate(category: { taxRate?: number | null } | null | undefined, fallback: number) {
  return typeof category?.taxRate === 'number' && Number.isFinite(category.taxRate)
    ? category.taxRate
    : fallback
}

function itemNetRevenue(
  item: { price: number; quantity: number; menuItem?: { category?: { taxRate?: number | null } | null } | null },
  fallbackTaxRate: number
) {
  const gross = item.price * item.quantity
  const taxRate = itemTaxRate(item.menuItem?.category, fallbackTaxRate)
  return taxRate > 0 ? gross / (1 + taxRate / 100) : gross
}

function itemCogs(
  item: { cost: number; quantity: number; menuItem?: { category?: { pnlType?: string | null } | null } | null }
) {
  return item.menuItem?.category?.pnlType === 'INCOME' ? 0 : item.cost * item.quantity
}

function parseReportDateParam(param: string | null, fallback: Date, boundary: 'start' | 'end') {
  const dateOnlyMatch = param?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3])
      )
    : param
      ? new Date(param)
      : new Date(fallback)

  if (boundary === 'start') {
    date.setHours(0, 0, 0, 0)
  } else {
    date.setHours(23, 59, 59, 999)
  }

  return date
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const locked = await requireRestaurantFeature(session.user.restaurantId, 'livePnl', 'Live P&L')
    if (locked) return locked

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')
    const branchId = searchParams.get('branchId')

    const now = new Date()
    const rangeStart = parseReportDateParam(startParam, new Date(now.getFullYear(), now.getMonth(), 1), 'start')
    const rangeEnd = parseReportDateParam(endParam, now, 'end')

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
    const [platformConfig, restaurant, sales, orderVoids, expenses, payrolls, expenseTransactions, wasteRecords, mealPrepSessions] = await Promise.all([
      getPlatformConfig(),
      prisma.restaurant.findUnique({
        where: { id: session.user.restaurantId },
        select: { settings: true, currency: true },
      }),
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
      prisma.orderVoid.findMany({
        where: {
          restaurantId: session.user.restaurantId,
          voidedAt: { gte: rangeStart, lte: rangeEnd },
          order: branchId
            ? branchId === 'unassigned'
              ? { branchId: null }
              : { branchId }
            : undefined,
        },
        include: {
          order: true,
          performedBy: {
            select: {
              id: true,
              name: true,
              email: true,
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

    const config = readLivePnlConfig(restaurant?.settings, platformConfig)
    const voidGrossSales = orderVoids.reduce((sum, orderVoid) => sum + orderVoid.amount, 0)

    // Calculate revenue net of customer-bill sales tax. Sales tax is a liability, not income.
    const grossSalesBeforeVoids = sales.reduce((sum, sale) => sum + sale.total, 0)
    const grossSales = grossSalesBeforeVoids - voidGrossSales
    const netRevenueBeforeVoids = sales.reduce(
      (sum, sale) => sum + sale.items.reduce((saleSum, item) => saleSum + itemNetRevenue(item, config.salesTaxRate), 0),
      0
    )
    const netVoidRevenue = config.salesTaxRate > 0
      ? voidGrossSales / (1 + config.salesTaxRate / 100)
      : voidGrossSales
    const netRevenue = netRevenueBeforeVoids - netVoidRevenue
    const taxCollected = Math.max(0, grossSales - netRevenue)
    const serviceChargeRevenue = config.serviceChargeRate > 0 ? netRevenue * (config.serviceChargeRate / 100) : 0
    const totalRevenue = netRevenue + serviceChargeRevenue

    // Revenue from items with complete costing (cost is set and numeric) for COGS coverage %
    let revenueWithCosting = 0
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const itemRevenue = itemNetRevenue(item, config.salesTaxRate)
        const hasCosting = typeof item.cost === 'number' && item.cost >= 0
        if (hasCosting) revenueWithCosting += itemRevenue
      })
    })
    const cogsCoveragePercent =
      totalRevenue > 0 ? Math.round((revenueWithCosting / totalRevenue) * 100) : 100

    // Calculate COGS from sales (ingredients used in completed orders)
    const totalCOGS = sales.reduce(
      (sum, sale) =>
        sum + sale.items.reduce((sub, item) => sub + itemCogs(item), 0),
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

    const itemMap = new Map<
      string,
      {
        menuItemId: string
        name: string
        category: string
        sold: number
        revenue: number
        cogs: number
      }
    >()
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const itemRevenue = itemNetRevenue(item, config.salesTaxRate)
        const existing = itemMap.get(item.menuItemId) || {
          menuItemId: item.menuItemId,
          name: item.menuItem?.name || 'Unknown item',
          category: item.menuItem?.category?.name || 'Uncategorized',
          sold: 0,
          revenue: 0,
          cogs: 0,
        }
        existing.sold += item.quantity
        existing.revenue += itemRevenue
        existing.cogs += itemCogs(item)
        itemMap.set(item.menuItemId, existing)
      })
    })
    const itemProfitabilityBase = Array.from(itemMap.values())
    const avgSold =
      itemProfitabilityBase.length > 0
        ? itemProfitabilityBase.reduce((sum, item) => sum + item.sold, 0) / itemProfitabilityBase.length
        : 0
    const avgMargin =
      itemProfitabilityBase.length > 0
        ? itemProfitabilityBase.reduce((sum, item) => sum + (item.revenue > 0 ? ((item.revenue - item.cogs) / item.revenue) * 100 : 0), 0) /
          itemProfitabilityBase.length
        : 0
    const itemProfitability = itemProfitabilityBase
      .map((item) => {
        const marginPercent = item.revenue > 0 ? ((item.revenue - item.cogs) / item.revenue) * 100 : 0
        const highSales = item.sold >= avgSold
        const highMargin = marginPercent >= avgMargin
        return {
          ...item,
          contributionMargin: item.revenue - item.cogs,
          marginPercent,
          quadrant: highSales && highMargin ? 'Star' : highSales ? 'Plowhorse' : highMargin ? 'Puzzle' : 'Dog',
        }
      })
      .sort((a, b) => b.revenue - a.revenue)

    // DISABLED for now: payroll (HR). Re-enable when full P&L is needed.
    // const payrollTotal = payrolls.reduce((sum, payroll) => sum + payroll.totalPaid, 0)
    const payrollTotal = payrolls.reduce((sum, payroll) => sum + payroll.totalPaid, 0)
    const serviceChargeStaffPayout = serviceChargeRevenue
    const laborTotal = payrollTotal + serviceChargeStaffPayout

    const today = new Date()
    const effectiveExpenseRangeEnd = rangeEnd > today ? today : rangeEnd
    const rangeIncludesCurrentMonth =
      rangeStart <= today &&
      rangeEnd >= startOfMonth(today)
    const elapsedOperatingDays = rangeIncludesCurrentMonth
      ? Math.min(config.operatingDaysInMonth, Math.max(1, today.getDate()))
      : Math.min(config.operatingDaysInMonth, daysBetweenInclusive(rangeStart, effectiveExpenseRangeEnd))

    const expenseTotals = expenses.map((expense) => {
      const isMonthlyFixed = ['MONTHLY', 'ANNUAL'].includes(expense.cadence)
      const accruedTotal = isMonthlyFixed
        ? accruedFixedExpenseTotalForPeriod(
            expense as {
              amount: number
              cadence: 'MONTHLY' | 'ANNUAL'
              startDate: Date
              endDate: Date | null
            },
            rangeStart,
            rangeEnd,
            today,
            config.operatingDaysInMonth
          )
        : expenseTotalForPeriod(expense, rangeStart, effectiveExpenseRangeEnd)
      return {
        ...expense,
        total: accruedTotal,
        bucket: expenseBucket(expense.category, expense.name),
      }
    })

    const expenseByCategory: Record<string, number> = {}
    let controllableExpenses = 0
    let occupancyExpenses = 0
    expenseTotals.forEach((expense) => {
      const category = expense.bucket === 'occupancy' ? 'Occupancy' : 'Controllable'
      expenseByCategory[category] = (expenseByCategory[category] || 0) + expense.total
      if (expense.bucket === 'occupancy') occupancyExpenses += expense.total
      else controllableExpenses += expense.total
    })

    // Add one-time expense transactions. Inventory/manual COGS stays above gross profit;
    // all other one-time expenses belong under operating expenses.
    expenseTransactions.forEach((tx) => {
      if (tx.notes?.includes('Waste record:')) return

      const isCOGS = tx.notes?.includes('COGS') || tx.notes?.includes('Manual stock adjustment')
      if (isCOGS) {
        expenseByCategory['COGS'] = (expenseByCategory['COGS'] || 0) + tx.amount
        return
      }

      if (tx.category === 'INVENTORY_PURCHASE') {
        // Plain delivery purchases update stock/unit cost; they become COGS when consumed/sold.
        return
      }

      const bucket = expenseBucket(tx.category, tx.name)
      if (bucket === 'occupancy') {
        occupancyExpenses += tx.amount
        expenseByCategory['Occupancy'] = (expenseByCategory['Occupancy'] || 0) + tx.amount
      } else {
        controllableExpenses += tx.amount
        expenseByCategory['Controllable'] = (expenseByCategory['Controllable'] || 0) + tx.amount
      }
    })

    // Add waste costs (these are NOT in expenseTransactions - they're separate waste records)
    const wasteTotal = wasteRecords.reduce((sum, waste) => sum + waste.cost, 0)
    if (wasteTotal > 0) {
      expenseByCategory['Waste'] = (expenseByCategory['Waste'] || 0) + wasteTotal
    }

    const totalExpenses = Object.values(expenseByCategory).reduce(
      (sum, value) => sum + value,
      0
    )

    const primeCost = totalCOGSWithPrep + laborTotal
    const operatingProfit = grossProfit - laborTotal - totalExpenses
    const ebitda = operatingProfit
    const profitTax = Math.max(0, ebitda * (config.profitTaxRate / 100))
    const netProfit = ebitda - profitTax

    // Return all non-waste one-time expense transactions that count toward Live P&L.
    const visibleExpenseTransactions = expenseTransactions.filter(
      (tx) =>
        !tx.notes?.includes('Waste record:') &&
        (tx.category !== 'INVENTORY_PURCHASE' ||
          tx.notes?.includes('COGS') ||
          tx.notes?.includes('Manual stock adjustment'))
    )

    return NextResponse.json({
      summary: {
        revenue: totalRevenue,
        grossSales,
        netRevenue,
        taxCollected,
        serviceChargeRevenue,
        cogs: totalCOGSWithPrep,
        cogsFromSales: totalCOGS,
        cogsFromMealPrep: mealPrepCOGS,
        cogsFromManualAdjustments: manualAdjustmentCOGS,
        grossProfit,
        expenses: totalExpenses,
        payroll: laborTotal,
        payrollBase: payrollTotal,
        serviceChargeStaffPayout,
        labor: laborTotal,
        primeCost,
        operatingProfit,
        ebitda,
        profitTax,
        netProfit,
        cogsCoveragePercent,
        revenueWithCosting,
        controllableExpenses,
        occupancyExpenses,
        grossProfitPercent: percentOf(grossProfit, totalRevenue),
        primeCostPercent: percentOf(primeCost, totalRevenue),
        ebitdaPercent: percentOf(ebitda, totalRevenue),
        netProfitPercent: percentOf(netProfit, totalRevenue),
      },
      config,
      fixedCostAccrual: {
        operatingDaysInMonth: config.operatingDaysInMonth,
        elapsedOperatingDays,
        monthlyFixed: expenseTotals
          .filter((expense) => ['MONTHLY', 'ANNUAL'].includes(expense.cadence))
          .reduce((sum, expense) => {
            const monthlyAmount = expense.cadence === 'ANNUAL' ? expense.amount / 12 : expense.amount
            return sum + monthlyAmount
          }, 0),
        recognizedSoFar: expenseTotals
          .filter((expense) => ['MONTHLY', 'ANNUAL'].includes(expense.cadence))
          .reduce((sum, expense) => sum + expense.total, 0),
      },
      itemProfitability,
      expenseByCategory,
      expenseTransactions: visibleExpenseTransactions,
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
      expenses: expenseTotals,
      payrolls,
      orderVoids: orderVoids.map((orderVoid) => ({
        id: orderVoid.id,
        orderId: orderVoid.orderId,
        orderNumber: orderVoid.order.orderNumber,
        amount: orderVoid.amount,
        reason: orderVoid.reason,
        restoresInventory: orderVoid.restoresInventory,
        voidedAt: orderVoid.voidedAt,
        performedBy: orderVoid.performedBy,
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
          cost: i.menuItem?.category?.pnlType === 'INCOME' ? 0 : i.cost,
          menuItem: i.menuItem ? {
            id: i.menuItem.id,
            name: i.menuItem.name,
            category: i.menuItem.category ? {
              id: i.menuItem.category.id,
              name: i.menuItem.category.name,
              pnlParent: i.menuItem.category.pnlParent,
              pnlType: i.menuItem.category.pnlType,
              taxRate: i.menuItem.category.taxRate,
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
