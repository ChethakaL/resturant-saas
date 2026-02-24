import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  Users,
  Utensils,
  Clock,
  TrendingDown,
  Package
} from 'lucide-react'
import { redirect } from 'next/navigation'
import PnLReminder from '@/components/dashboard/PnLReminder'
import DailyRevenueMarginChart from '@/components/dashboard/DailyRevenueMarginChart'
import MenuItemAnalytics from '@/components/dashboard/MenuItemAnalytics'

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

const TIME_BUCKETS = ['Morning', 'Afternoon', 'Evening'] as const
type TimeBucket = typeof TIME_BUCKETS[number]

function getTimeBucket(date: Date): TimeBucket {
  const hour = date.getHours()
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

async function getAnalyticsData(restaurantId: string) {
  const endDate = new Date()
  const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1)

  const monthlySales = await prisma.sale.findMany({
    where: {
      restaurantId,
      status: 'COMPLETED',
      timestamp: {
        gte: monthStart,
        lte: endDate,
      },
    },
    include: {
      items: true,
    },
  })

  const monthlySaleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        restaurantId,
        status: 'COMPLETED',
        timestamp: {
          gte: monthStart,
          lte: endDate,
        },
      },
    },
    include: {
      menuItem: true,
      sale: true,
    },
  })

  const itemStats = new Map<
    string,
    {
      id: string
      name: string
      quantity: number
      revenue: number
      profit: number
      timeOfDay: Record<TimeBucket, number>
    }
  >()

  monthlySaleItems.forEach((item) => {
    const lineRevenue = item.price * item.quantity
    const lineProfit = (item.price - item.cost) * item.quantity
    const bucket = getTimeBucket(item.sale.timestamp)
    const current = itemStats.get(item.menuItemId) || {
      id: item.menuItemId,
      name: item.menuItem.name,
      quantity: 0,
      revenue: 0,
      profit: 0,
      timeOfDay: {
        Morning: 0,
        Afternoon: 0,
        Evening: 0,
      },
    }

    current.quantity += item.quantity
    current.revenue += lineRevenue
    current.profit += lineProfit
    current.timeOfDay[bucket] += item.quantity
    itemStats.set(item.menuItemId, current)
  })

  const comboMap = new Map<
    string,
    {
      items: [string, string]
      count: number
      revenue: number
      profit: number
      timeOfDay: Record<TimeBucket, number>
    }
  >()
  const topPairByItem = new Map<string, { item: string; count: number }>()

  monthlySales.forEach((sale) => {
    const uniqueItems = Array.from(
      new Set(sale.items.map((item) => item.menuItemId))
    )
    const bucket = getTimeBucket(sale.timestamp)
    const saleRevenue = sale.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )
    const saleProfit = sale.items.reduce(
      (sum, item) => sum + (item.price - item.cost) * item.quantity,
      0
    )

    for (let i = 0; i < uniqueItems.length; i += 1) {
      for (let j = i + 1; j < uniqueItems.length; j += 1) {
        const a = uniqueItems[i]
        const b = uniqueItems[j]
        const key = [a, b].sort().join('|')
        const current = comboMap.get(key) || {
          items: [a, b] as [string, string],
          count: 0,
          revenue: 0,
          profit: 0,
          timeOfDay: {
            Morning: 0,
            Afternoon: 0,
            Evening: 0,
          },
        }

        current.count += 1
        current.revenue += saleRevenue
        current.profit += saleProfit
        current.timeOfDay[bucket] += 1
        comboMap.set(key, current)

        const updateTopPair = (primary: string, secondary: string) => {
          const existing = topPairByItem.get(primary)
          if (!existing || existing.count < current.count) {
            topPairByItem.set(primary, { item: secondary, count: current.count })
          }
        }
        updateTopPair(a, b)
        updateTopPair(b, a)
      }
    }
  })

  const itemStatsArray = Array.from(itemStats.values()).map((item) => {
    const topTimeOfDay = TIME_BUCKETS.reduce((top, bucket) =>
      item.timeOfDay[bucket] > item.timeOfDay[top] ? bucket : top
    )
    return {
      ...item,
      margin: item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0,
      topTimeOfDay,
    }
  })

  const menuItemNameById = new Map(
    monthlySaleItems.map((item) => [item.menuItemId, item.menuItem.name])
  )

  const topSellingItems = [...itemStatsArray]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)
    .map((item) => ({
      ...item,
      commonlyWith: topPairByItem.get(item.id)?.item
        ? menuItemNameById.get(topPairByItem.get(item.id)!.item)
        : undefined,
    }))

  const worstSellingItems = [...itemStatsArray]
    .filter((item) => item.quantity > 0)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 10)

  const highestMarginItems = [...itemStatsArray]
    .filter((item) => item.revenue > 0)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10)
    .map((item) => ({
      ...item,
      commonlyWith: topPairByItem.get(item.id)?.item
        ? menuItemNameById.get(topPairByItem.get(item.id)!.item)
        : undefined,
    }))

  const lowestMarginItems = [...itemStatsArray]
    .filter((item) => item.revenue > 0)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 10)

  const topCombos = Array.from(comboMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((combo) => {
      const topTimeOfDay = TIME_BUCKETS.reduce((top, bucket) =>
        combo.timeOfDay[bucket] > combo.timeOfDay[top] ? bucket : top
      )
      const marginValue = combo.revenue > 0 ? (combo.profit / combo.revenue) * 100 : 0
      return {
        items: combo.items.map((id) => menuItemNameById.get(id) || 'Unknown') as [string, string],
        count: combo.count,
        margin: marginValue,
        topTimeOfDay,
      }
    })

  return {
    topSellingItems,
    worstSellingItems,
    highestMarginItems,
    lowestMarginItems,
    topCombos,
  }
}

async function getDashboardData(restaurantId: string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Today's metrics
  const todaySales = await prisma.sale.aggregate({
    where: {
      restaurantId,
      timestamp: { gte: todayStart },
      status: 'COMPLETED',
    },
    _sum: { total: true },
    _count: true,
  })

  const todayRevenue = todaySales._sum.total || 0
  const todayOrders = todaySales._count

  // Calculate today's COGS and margin
  const todaySaleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        restaurantId,
        timestamp: { gte: todayStart },
        status: 'COMPLETED',
      },
    },
    select: {
      quantity: true,
      cost: true,
    },
  })

  const todayCOGS = todaySaleItems.reduce((sum, item) => sum + (item.quantity * item.cost), 0)
  const todayMargin = todayRevenue > 0 ? ((todayRevenue - todayCOGS) / todayRevenue) * 100 : 0

  // Yesterday's revenue for comparison
  const yesterdaySales = await prisma.sale.aggregate({
    where: {
      restaurantId,
      timestamp: { gte: yesterdayStart, lt: todayStart },
      status: 'COMPLETED',
    },
    _sum: { total: true },
  })

  const yesterdayRevenue = yesterdaySales._sum.total || 0
  const revenueGrowth = yesterdayRevenue > 0
    ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
    : 0

  // Weekly metrics
  const weeklySales = await prisma.sale.aggregate({
    where: {
      restaurantId,
      timestamp: { gte: weekStart },
      status: 'COMPLETED',
    },
    _sum: { total: true },
    _count: true,
  })

  const weeklyRevenue = weeklySales._sum.total || 0
  const weeklyOrders = weeklySales._count

  const weeklySalesData = await prisma.sale.findMany({
    where: {
      restaurantId,
      timestamp: { gte: weekStart },
      status: 'COMPLETED',
    },
    select: {
      timestamp: true,
      total: true,
    },
  })

  const dailyMap = new Map<string, { revenue: number; orders: number }>()
  weeklySalesData.forEach((sale) => {
    const key = sale.timestamp.toISOString().slice(0, 10)
    const current = dailyMap.get(key) || { revenue: 0, orders: 0 }
    dailyMap.set(key, {
      revenue: current.revenue + sale.total,
      orders: current.orders + 1,
    })
  })

  const weeklyTrend: { date: string; revenue: number; orders: number }[] = []
  const shortDateFormatter = new Intl.DateTimeFormat('en-IQ', {
    weekday: 'short',
  })
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(todayStart)
    day.setDate(todayStart.getDate() - i)
    const key = day.toISOString().slice(0, 10)
    const entry = dailyMap.get(key) || { revenue: 0, orders: 0 }
    weeklyTrend.push({
      date: shortDateFormatter.format(day),
      revenue: entry.revenue,
      orders: entry.orders,
    })
  }

  // Monthly metrics
  const monthlySales = await prisma.sale.aggregate({
    where: {
      restaurantId,
      timestamp: { gte: monthStart },
      status: 'COMPLETED',
    },
    _sum: { total: true },
    _count: true,
  })

  const monthlyRevenue = monthlySales._sum.total || 0
  const monthlyOrders = monthlySales._count

  // Monthly COGS and profit
  const monthlySaleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        restaurantId,
        timestamp: { gte: monthStart },
        status: 'COMPLETED',
      },
    },
    select: {
      quantity: true,
      cost: true,
      price: true,
    },
  })

  const monthlyCOGSFromSales = monthlySaleItems.reduce(
    (sum, item) => sum + (item.quantity * item.cost),
    0
  )

  const [monthlyExpenses, monthlyExpenseTransactions, monthlyWasteRecords, monthlyPayrolls, monthlyMealPrepSessions] = await Promise.all([
    prisma.expense.findMany({
      where: { restaurantId },
    }),
    prisma.expenseTransaction.findMany({
      where: {
        restaurantId,
        date: {
          gte: monthStart,
          lte: now,
        },
      },
    }),
    prisma.wasteRecord.findMany({
      where: {
        restaurantId,
        date: {
          gte: monthStart,
          lte: now,
        },
      },
      include: { ingredient: true },
      orderBy: { date: 'desc' },
    }),
    prisma.payroll.findMany({
      where: {
        restaurantId,
        status: 'PAID',
        period: {
          gte: monthStart,
          lte: now,
        },
      },
    }),
    prisma.mealPrepSession.findMany({
      where: {
        restaurantId,
        prepDate: {
          gte: monthStart,
          lte: now,
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

  const mealPrepCOGS = monthlyMealPrepSessions.reduce((sum, session) => {
    return sum + session.inventoryUsages.reduce((sessionSum, usage) => {
      return sessionSum + (usage.quantityUsed * usage.ingredient.costPerUnit)
    }, 0)
  }, 0)

  const monthlyCOGS = monthlyCOGSFromSales + mealPrepCOGS

  const recurringExpenseTotal = monthlyExpenses.reduce((sum, expense) => {
    return sum + expenseTotalForPeriod(expense, monthStart, now)
  }, 0)

  const expenseTransactionsTotal = monthlyExpenseTransactions.reduce(
    (sum, tx) => sum + tx.amount,
    0
  )

  const wasteTotal = monthlyWasteRecords.reduce((sum, waste) => sum + waste.cost, 0)
  const payrollTotal = monthlyPayrolls.reduce((sum, payroll) => sum + payroll.totalPaid, 0)
  const totalOperatingExpenses = recurringExpenseTotal + expenseTransactionsTotal + wasteTotal

  const monthlyNetProfit = monthlyRevenue - monthlyCOGS - totalOperatingExpenses - payrollTotal
  const monthlyMargin = monthlyRevenue > 0 ? (monthlyNetProfit / monthlyRevenue) * 100 : 0
  const foodCostPercent = monthlyRevenue > 0 ? (monthlyCOGS / monthlyRevenue) * 100 : 0

  // MTD run-rate forecast for "early warning likely losses this month"
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysElapsed = Math.max(now.getDate(), 1)
  const projectedRevenue = (monthlyRevenue / daysElapsed) * daysInMonth
  const projectedCOGS = (monthlyCOGS / daysElapsed) * daysInMonth
  const projectedExpenses = (totalOperatingExpenses / daysElapsed) * daysInMonth
  const projectedPayroll = (payrollTotal / daysElapsed) * daysInMonth
  const projectedNetProfit = projectedRevenue - projectedCOGS - projectedExpenses - projectedPayroll
  const forecastDrivers: Array<{ label: string; amount: number }> = []
  if (projectedCOGS > 0) forecastDrivers.push({ label: 'COGS', amount: projectedCOGS })
  if (projectedPayroll > 0) forecastDrivers.push({ label: 'Labor', amount: projectedPayroll })
  if (projectedExpenses > 0) forecastDrivers.push({ label: 'Operating Expenses', amount: projectedExpenses })
  forecastDrivers.sort((a, b) => b.amount - a.amount)
  const projectedLossForecast = {
    projectedNetProfit,
    isLoss: projectedNetProfit < 0,
    projectedRevenue,
    daysElapsed,
    daysInMonth,
    drivers: forecastDrivers.slice(0, 3),
  }

  // Top selling items (this week)
  const topItems = await prisma.saleItem.groupBy({
    by: ['menuItemId'],
    where: {
      sale: {
        restaurantId,
        timestamp: { gte: weekStart },
        status: 'COMPLETED',
      },
    },
    _sum: {
      quantity: true,
      price: true,
    },
    orderBy: {
      _sum: {
        quantity: 'desc',
      },
    },
    take: 5,
  })

  // Batch fetch menu items instead of N+1 queries
  const topItemIds = topItems.map((item) => item.menuItemId)
  const menuItemsMap = topItemIds.length > 0
    ? new Map(
        (await prisma.menuItem.findMany({
          where: { id: { in: topItemIds } },
          select: { id: true, name: true },
        })).map((item) => [item.id, item.name])
      )
    : new Map<string, string>()

  const topItemsData = topItems.map((item) => ({
    name: menuItemsMap.get(item.menuItemId) || 'Unknown',
    quantity: item._sum.quantity || 0,
    revenue: item._sum.price || 0,
  }))

  const wastageTotalCost = monthlyWasteRecords.reduce((sum, w) => sum + w.cost, 0)

  // Low stock alerts
  const allIngredients = await prisma.ingredient.findMany({
    where: { restaurantId },
    select: {
      id: true,
      name: true,
      stockQuantity: true,
      minStockLevel: true,
      unit: true,
    },
  })

  const lowStockItems = allIngredients.filter(
    ing => ing.stockQuantity < ing.minStockLevel
  )

  const criticalStockItems = allIngredients.filter(
    ing => ing.stockQuantity < (ing.minStockLevel * 0.25)
  )

  // Tables in use
  const tablesInUse = await prisma.table.count({
    where: {
      restaurantId,
      status: 'OCCUPIED',
    },
  })

  const totalTables = await prisma.table.count({
    where: { restaurantId },
  })

  // Busiest hours (last 7 days)
  const hourlyData = await prisma.sale.findMany({
    where: {
      restaurantId,
      timestamp: { gte: weekStart },
      status: 'COMPLETED',
    },
    select: {
      timestamp: true,
      total: true,
    },
  })

  const hourlyStats = new Map<number, { count: number; revenue: number }>()
  hourlyData.forEach((sale) => {
    const hour = sale.timestamp.getHours()
    const current = hourlyStats.get(hour) || { count: 0, revenue: 0 }
    hourlyStats.set(hour, {
      count: current.count + 1,
      revenue: current.revenue + sale.total,
    })
  })

  const busiestHour = Array.from(hourlyStats.entries())
    .sort((a, b) => b[1].count - a[1].count)[0]

  return {
    today: {
      revenue: todayRevenue,
      orders: todayOrders,
      margin: todayMargin,
      growth: revenueGrowth,
      tablesInUse,
      totalTables,
    },
    week: {
      revenue: weeklyRevenue,
      orders: weeklyOrders,
    },
    weeklyTrend,
    month: {
      revenue: monthlyRevenue,
      orders: monthlyOrders,
      profit: monthlyNetProfit,
      margin: monthlyMargin,
      foodCostPercent,
    },
    projectedLossForecast,
    topItems: topItemsData,
    wastage: {
      totalCost: wastageTotalCost,
      recordCount: monthlyWasteRecords.length,
      records: monthlyWasteRecords.slice(0, 10),
    },
    inventory: {
      lowStock: lowStockItems.length,
      critical: criticalStockItems.length,
      lowStockItems,
    },
    busiestHour: busiestHour ? {
      hour: busiestHour[0],
      orders: busiestHour[1].count,
      revenue: busiestHour[1].revenue,
    } : null,
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId
  if (session!.user.role === 'STAFF') {
    redirect('/dashboard/orders')
  }

  const data = await getDashboardData(restaurantId)

  // Get analytics data for menu items
  const analyticsData = await getAnalyticsData(restaurantId)

  return (
    <div className="space-y-8">
      <PnLReminder />
      {data.projectedLossForecast.isLoss && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-800">
                Projected net loss this month: {formatCurrency(Math.abs(data.projectedLossForecast.projectedNetProfit))}
              </h3>
              <p className="text-sm text-red-700 mt-1">
                Based on {data.projectedLossForecast.daysElapsed} of {data.projectedLossForecast.daysInMonth} days,
                projected revenue is {formatCurrency(data.projectedLossForecast.projectedRevenue)}.
              </p>
              {data.projectedLossForecast.drivers.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-red-700 uppercase tracking-wide">Top cost drivers</p>
                  <ul className="mt-1 space-y-0.5">
                    {data.projectedLossForecast.drivers.map((d) => (
                      <li key={d.label} className="text-sm text-red-700 flex justify-between max-w-xs">
                        <span>{d.label}</span>
                        <span className="font-mono">{formatCurrency(d.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <a
                href="/profit-loss"
                className="inline-block mt-3 text-sm font-medium text-red-700 hover:text-red-800 underline"
              >
                View Sales Reports →
              </a>
            </div>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Welcome back, {session!.user.name}</p>
      </div>

      {/* TODAY Metrics */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Today</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.today.revenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className={data.today.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {data.today.growth >= 0 ? '+' : ''}{formatPercentage(data.today.growth, 1)}
                </span>
                {' '}vs yesterday
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.today.orders}</div>
              <p className="text-xs text-muted-foreground mt-1">Completed today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customers Served</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.today.orders}</div>
              <p className="text-xs text-muted-foreground mt-1">Based on orders</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tables in Use</CardTitle>
              <Utensils className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.today.tablesInUse}</div>
              <p className="text-xs text-muted-foreground mt-1">
                of {data.today.totalTables} total
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* WEEKLY & MONTHLY Metrics */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">This Week</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Revenue</span>
                  <span className="text-2xl font-bold text-green-600">
                    {formatCurrency(data.week.revenue)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Total Orders</span>
                  <span className="text-xl font-bold">{data.week.orders}</span>
                </div>
                {data.busiestHour && (
                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-600" />
                        <span className="text-sm text-slate-600">Busiest Hour</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">
                          {data.busiestHour.hour}:00 - {data.busiestHour.hour + 1}:00
                        </div>
                        <div className="text-xs text-slate-500">
                          {data.busiestHour.orders} orders avg
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">This Month</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Total Revenue</span>
                  <span className="text-2xl font-bold text-green-600">
                    {formatCurrency(data.month.revenue)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Net Profit</span>
                  <span className="text-xl font-bold text-blue-600">
                    {formatCurrency(data.month.profit)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                  <div>
                    <div className="text-xs text-slate-600">Net Margin</div>
                    <div className={`text-lg font-bold ${data.month.margin >= 60 ? 'text-green-600' : 'text-amber-600'}`}>
                      {formatPercentage(data.month.margin, 1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-600">Food Cost %</div>
                    <div className={`text-lg font-bold ${data.month.foodCostPercent <= 35 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercentage(data.month.foodCostPercent, 1)}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Menu Item Analytics */}
      <MenuItemAnalytics
        topSellingItems={analyticsData.topSellingItems}
        worstSellingItems={analyticsData.worstSellingItems}
        highestMarginItems={analyticsData.highestMarginItems}
        lowestMarginItems={analyticsData.lowestMarginItems}
        topCombos={analyticsData.topCombos}
      />

      {/* Daily Revenue and Margin Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue and Margin Trend</CardTitle>
          <p className="text-sm text-slate-500 mt-1">Daily revenue and margin for the past month</p>
        </CardHeader>
        <CardContent>
          <DailyRevenueMarginChart />
        </CardContent>
      </Card>

      {/* WASTAGE (this month — same as P&L) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-amber-500" />
            Wastage (This Month)
          </CardTitle>
          <a
            href="/profit-loss"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            View in Sales Reports →
          </a>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-slate-600">Total wastage cost</span>
              <span className="text-2xl font-bold text-amber-700">
                {formatCurrency(data.wastage.totalCost)}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {data.wastage.recordCount} waste record{data.wastage.recordCount !== 1 ? 's' : ''} this month
            </p>
            {data.wastage.records.length > 0 ? (
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-medium text-slate-600">Ingredient</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-600">Qty</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-600">Cost</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.wastage.records.map((w) => (
                      <tr key={w.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 px-3">{w.ingredient.name}</td>
                        <td className="py-2 px-3 text-right">
                          {w.quantity} {w.ingredient.unit}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-amber-700">
                          {formatCurrency(w.cost)}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{w.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-slate-500 py-4">No wastage recorded this month</p>
            )}
          </div>
        </CardContent>
      </Card>

      
    </div>
  )
}
