import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'
import Link from 'next/link'

const statusTabs = [
  { label: 'All Orders', value: 'all' },
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
  searchParams?: { status?: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const statusFilter = searchParams?.status || 'all'
  const where: any = { restaurantId }

  if (statusFilter !== 'all') {
    where.status = statusFilter
  }

  const orders = await prisma.sale.findMany({
    where,
    include: {
      items: true,
    },
    orderBy: { timestamp: 'desc' },
  })

  const completedOrders = orders.filter((order) => order.status === 'COMPLETED')
  const cancelledOrders = orders.filter((order) => order.status === 'CANCELLED')
  const totalRevenue = completedOrders.reduce((sum, order) => sum + order.total, 0)
  const averageOrderValue =
    completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('en-IQ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Orders</h1>
          <p className="text-slate-500 mt-1">Track sales history and manage cancellations</p>
        </div>
        <Link href="/dashboard/orders/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-slate-500 mt-1">Completed orders only</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Orders in View</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-xs text-slate-500 mt-1">
              {completedOrders.length} completed, {cancelledOrders.length} cancelled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageOrderValue)}</div>
            <p className="text-xs text-slate-500 mt-1">Based on completed orders</p>
          </CardContent>
        </Card>
      </div>

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
                      {formatCurrency(order.total)}
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
        </CardContent>
      </Card>
    </div>
  )
}
