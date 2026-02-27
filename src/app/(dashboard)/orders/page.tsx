import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getServerTranslations } from '@/lib/i18n/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import CompleteOrderButton from '@/components/orders/CompleteOrderButton'

const statusTabs = [
  { label: 'All Orders', value: 'all' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

function getStatusBadge(status: string) {
  if (status === 'COMPLETED') {
    return 'bg-green-100 text-green-800'
  }
  if (status === 'CANCELLED') {
    return 'bg-red-100 text-red-800'
  }
  if (status === 'PENDING') {
    return 'bg-amber-100 text-amber-800'
  }
  return 'bg-slate-100 text-slate-800'
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: { status?: string; page?: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(todayStart.getDate() - 6)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const statusFilter = searchParams?.status || 'all'
  const page = Math.max(Number(searchParams?.page || 1), 1)
  const pageSize = 10
  const where: any = { restaurantId }

  if (statusFilter !== 'all') {
    where.status = statusFilter
  }

  const [
    orders,
    totalOrders,
    statusCounts,
    completedStats,
    pendingOrders,
    daySummary,
    weekSummary,
    monthSummary,
    topItems,
  ] =
    await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          items: true,
          table: true,
        },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.sale.count({
        where,
      }),
      prisma.sale.groupBy({
        by: ['status'],
        where: {
          restaurantId,
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        },
        _count: { _all: true },
      }),
      prisma.sale.aggregate({
        where: {
          restaurantId,
          status: 'COMPLETED',
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.sale.findMany({
        where: {
          restaurantId,
          status: 'PENDING',
        },
        include: {
          items: {
            include: {
              menuItem: true,
            },
          },
          table: true,
        },
        orderBy: { timestamp: 'desc' },
      }),
      prisma.sale.aggregate({
        where: {
          restaurantId,
          status: 'COMPLETED',
          timestamp: { gte: todayStart, lte: now },
        },
        _sum: { total: true },
      }),
      prisma.sale.aggregate({
        where: {
          restaurantId,
          status: 'COMPLETED',
          timestamp: { gte: weekStart, lte: now },
        },
        _sum: { total: true },
      }),
      prisma.sale.aggregate({
        where: {
          restaurantId,
          status: 'COMPLETED',
          timestamp: { gte: monthStart, lte: now },
        },
        _sum: { total: true },
      }),
      prisma.saleItem.groupBy({
        by: ['menuItemId'],
        where: {
          sale: {
            restaurantId,
            status: 'COMPLETED',
            timestamp: { gte: monthStart, lte: now },
          },
        },
        _sum: {
          quantity: true,
          price: true,
        },
        orderBy: {
          _sum: {
            price: 'desc',
          },
        },
        take: 5,
      }),
    ])

  // Batch fetch menu items instead of N+1 queries
  const topItemIds = topItems.map((item) => item.menuItemId)
  const menuItemsForTop = topItemIds.length > 0
    ? await prisma.menuItem.findMany({
      where: { id: { in: topItemIds } },
      select: { id: true, name: true },
    })
    : []
  const menuItemsMap = new Map(menuItemsForTop.map((item) => [item.id, item.name]))
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { currency: true } })
  const currency = restaurant?.currency ?? 'IQD'

  const topItemsWithNames = topItems.map((item) => ({
    id: item.menuItemId,
    name: menuItemsMap.get(item.menuItemId) || 'Unknown',
    revenue: item._sum.price || 0,
    quantity: item._sum.quantity || 0,
  }))

  const completedOrdersCount =
    statusCounts.find((status) => status.status === 'COMPLETED')?._count._all || 0
  const cancelledOrdersCount =
    statusCounts.find((status) => status.status === 'CANCELLED')?._count._all || 0
  const totalRevenue = completedStats._sum.total || 0
  const averageOrderValue =
    completedStats._count._all > 0 ? totalRevenue / completedStats._count._all : 0
  const dayRevenue = daySummary._sum.total || 0
  const weekRevenue = weekSummary._sum.total || 0
  const monthRevenue = monthSummary._sum.total || 0
  const totalPages = Math.max(Math.ceil(totalOrders / pageSize), 1)

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('en-IQ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)

  const { t } = await getServerTranslations()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t.orders_title}</h1>
          <p className="text-slate-500 mt-1">{t.orders_subtitle}</p>
        </div>
        <Link href="/dashboard/orders/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t.orders_new_order}
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue, currency)}</div>
            <p className="text-xs text-slate-500 mt-1">Completed orders only</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Orders in View</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-slate-500 mt-1">
              {completedOrdersCount} completed, {cancelledOrdersCount} cancelled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageOrderValue, currency)}</div>
            <p className="text-xs text-slate-500 mt-1">Based on completed orders</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales Transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Revenue Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(dayRevenue, currency)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Completed orders only</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Revenue (Last 7 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(weekRevenue, currency)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Rolling 7-day total</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Revenue (Month-to-date)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(monthRevenue, currency)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Month-to-date total</p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700">Top Dishes</h3>
            <p className="text-xs text-slate-500 mt-1">Best sellers this month</p>
            <div className="mt-4 space-y-3">
              {topItemsWithNames.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.quantity} sold</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatCurrency(item.revenue, currency)}
                  </div>
                </div>
              ))}
              {topItemsWithNames.length === 0 && (
                <p className="text-sm text-slate-500">No sales data for this month.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Orders Section */}
      {pendingOrders.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-amber-600">Pending Orders</span>
              <span className="text-sm font-normal text-slate-500">
                ({pendingOrders.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-amber-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Order
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Table
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Time
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Items
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Total
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.map((order) => (
                    <tr key={order.id} className="border-b border-amber-100 hover:bg-amber-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{order.orderNumber}</div>
                        {order.customerName && (
                          <div className="text-sm text-slate-500">{order.customerName}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {order.table ? `Table ${order.table.number}` : 'No table'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(order.timestamp)}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium">
                        {formatCurrency(order.total, currency)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <CompleteOrderButton order={order} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => (
          <Link key={tab.value} href={`/dashboard/orders?status=${tab.value}`}>
            <Button
              variant={statusFilter === tab.value ? 'default' : 'outline'}
              size="sm"
            >
              {tab.label}
            </Button>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Order
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Time
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Items
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Total
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{order.orderNumber}</div>
                      {order.customerName && (
                        <div className="text-sm text-slate-500">{order.customerName}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{formatDate(order.timestamp)}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium">
                      {formatCurrency(order.total, currency)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={cn(
                          'inline-flex px-2 py-1 rounded-full text-xs font-medium',
                          getStatusBadge(order.status)
                        )}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/dashboard/orders/${order.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {orders.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-500">No orders found for this filter.</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/orders?status=${statusFilter}&page=${Math.max(
                  page - 1,
                  1
                )}`}
              >
                <Button variant="outline" size="sm" disabled={page <= 1}>
                  Previous
                </Button>
              </Link>
              <Link
                href={`/dashboard/orders?status=${statusFilter}&page=${Math.min(
                  page + 1,
                  totalPages
                )}`}
              >
                <Button variant="outline" size="sm" disabled={page >= totalPages}>
                  Next
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
