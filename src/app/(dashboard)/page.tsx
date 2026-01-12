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
  Award,
  Package
} from 'lucide-react'

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

  const monthlyCOGS = monthlySaleItems.reduce((sum, item) => sum + (item.quantity * item.cost), 0)
  const monthlyProfit = monthlyRevenue - monthlyCOGS
  const monthlyMargin = monthlyRevenue > 0 ? ((monthlyRevenue - monthlyCOGS) / monthlyRevenue) * 100 : 0
  const foodCostPercent = monthlyRevenue > 0 ? (monthlyCOGS / monthlyRevenue) * 100 : 0

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

  const topItemsData = await Promise.all(
    topItems.map(async (item) => {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId },
      })
      return {
        name: menuItem?.name || 'Unknown',
        quantity: item._sum.quantity || 0,
        revenue: item._sum.price || 0,
      }
    })
  )

  // Top waiters (this month)
  const topWaiters = await prisma.sale.groupBy({
    by: ['waiterId'],
    where: {
      restaurantId,
      timestamp: { gte: monthStart },
      status: 'COMPLETED',
      waiterId: { not: null },
    },
    _sum: {
      total: true,
    },
    _count: true,
    orderBy: {
      _sum: {
        total: 'desc',
      },
    },
    take: 5,
  })

  const topWaitersData = await Promise.all(
    topWaiters.map(async (waiter) => {
      const employee = await prisma.employee.findUnique({
        where: { id: waiter.waiterId! },
      })
      return {
        name: employee?.name || 'Unknown',
        sales: waiter._sum.total || 0,
        orders: waiter._count,
        avgOrder: waiter._count > 0 ? (waiter._sum.total || 0) / waiter._count : 0,
      }
    })
  )

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
    month: {
      revenue: monthlyRevenue,
      orders: monthlyOrders,
      profit: monthlyProfit,
      margin: monthlyMargin,
      foodCostPercent,
    },
    topItems: topItemsData,
    topWaiters: topWaitersData,
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

  const data = await getDashboardData(restaurantId)

  return (
    <div className="space-y-8">
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
                  <span className="text-slate-600">Gross Profit</span>
                  <span className="text-xl font-bold text-blue-600">
                    {formatCurrency(data.month.profit)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                  <div>
                    <div className="text-xs text-slate-600">Profit Margin</div>
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

      {/* TOP PERFORMERS */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-500" />
            Top Selling Items (This Week)
          </h2>
          <Card>
            <CardContent className="pt-6">
              {data.topItems.length > 0 ? (
                <div className="space-y-3">
                  {data.topItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-amber-100 text-amber-800' :
                          idx === 1 ? 'bg-slate-100 text-slate-800' :
                          idx === 2 ? 'bg-orange-100 text-orange-800' :
                          'bg-slate-50 text-slate-600'
                        }`}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-slate-500">{item.quantity} sold</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">
                          {formatCurrency(item.revenue)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-500 py-4">No sales data yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Top Waiters (This Month)
          </h2>
          <Card>
            <CardContent className="pt-6">
              {data.topWaiters.length > 0 ? (
                <div className="space-y-3">
                  {data.topWaiters.map((waiter, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-blue-100 text-blue-800' :
                          idx === 1 ? 'bg-slate-100 text-slate-800' :
                          idx === 2 ? 'bg-indigo-100 text-indigo-800' :
                          'bg-slate-50 text-slate-600'
                        }`}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-medium">{waiter.name}</div>
                          <div className="text-xs text-slate-500">
                            {waiter.orders} orders • {formatCurrency(waiter.avgOrder)} avg
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-blue-600">
                          {formatCurrency(waiter.sales)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-500 py-4">No waiter data yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* INVENTORY ALERTS */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Package className="h-5 w-5 text-red-500" />
          Inventory Alerts
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Low Stock Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600 mb-3">
                {data.inventory.lowStock}
              </div>
              {data.inventory.lowStockItems.slice(0, 3).map((item) => (
                <div key={item.id} className="text-sm text-slate-700 mb-1">
                  • {item.name}: {item.stockQuantity.toFixed(1)} {item.unit}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                Critical Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600 mb-3">
                {data.inventory.critical}
              </div>
              <p className="text-sm text-red-800">
                {data.inventory.critical > 0
                  ? 'Immediate restocking required'
                  : 'All items above critical level'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
