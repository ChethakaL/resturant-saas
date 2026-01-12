import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { notFound } from 'next/navigation'

async function getTable(tableId: string, restaurantId: string) {
  const table = await prisma.table.findFirst({
    where: {
      id: tableId,
      restaurantId,
    },
    include: {
      sales: {
        include: {
          items: {
            include: {
              menuItem: true,
            },
          },
          waiter: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
      },
    },
  })

  return table
}

function getStatusColor(status: string) {
  switch (status) {
    case 'AVAILABLE':
      return 'bg-green-100 text-green-800'
    case 'OCCUPIED':
      return 'bg-amber-100 text-amber-800'
    case 'RESERVED':
      return 'bg-blue-100 text-blue-800'
    case 'CLEANING':
      return 'bg-slate-100 text-slate-800'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

function getOrderStatusColor(status: string) {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800'
    case 'PREPARING':
      return 'bg-blue-100 text-blue-800'
    case 'READY':
      return 'bg-green-100 text-green-800'
    case 'COMPLETED':
      return 'bg-slate-100 text-slate-800'
    case 'CANCELLED':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

export default async function TableDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const table = await getTable(params.id, restaurantId)

  if (!table) {
    notFound()
  }

  const activeOrders = table.sales.filter(
    (s) => s.status === 'PENDING' || s.status === 'PREPARING' || s.status === 'READY'
  )

  const pastOrders = table.sales.filter(
    (s) => s.status === 'COMPLETED' || s.status === 'CANCELLED'
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/tables">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tables
          </Link>
        </Button>
      </div>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Table {table.number}</h1>
          <p className="text-slate-500 mt-1">Capacity: {table.capacity} seats</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`px-4 py-2 rounded-lg font-semibold ${getStatusColor(table.status)}`}>
            {table.status}
          </span>
          <Button asChild>
            <Link href={`/orders/new?tableId=${table.id}`}>
              <Plus className="mr-2 h-4 w-4" />
              New Order
            </Link>
          </Button>
        </div>
      </div>

      {activeOrders.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Active Orders</h2>
          <div className="space-y-4">
            {activeOrders.map((order) => (
              <Card key={order.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{order.orderNumber}</CardTitle>
                      <p className="text-sm text-slate-500 mt-1">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getOrderStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                      <Button size="sm" asChild>
                        <Link href={`/orders/${order.id}`}>View</Link>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-600">Waiter:</span>
                        <span className="ml-2 font-medium">{order.waiter?.name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-600">Payment:</span>
                        <span className="ml-2 font-medium">{order.paymentMethod}</span>
                      </div>
                      {order.customerName && (
                        <div>
                          <span className="text-slate-600">Customer:</span>
                          <span className="ml-2 font-medium">{order.customerName}</span>
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-3">
                      <div className="space-y-2">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span>
                              {item.quantity}x {item.menuItem.name}
                            </span>
                            <span className="font-medium">
                              {formatCurrency(item.price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t pt-3 flex justify-between items-center">
                      <span className="font-semibold">Total:</span>
                      <span className="text-xl font-bold text-green-600">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {pastOrders.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Order History</h2>
          <div className="space-y-3">
            {pastOrders.map((order) => (
              <Card key={order.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{order.orderNumber}</span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getOrderStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {new Date(order.createdAt).toLocaleDateString()} - {order.waiter?.name || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">{formatCurrency(order.total)}</div>
                      <Button size="sm" variant="outline" asChild className="mt-2">
                        <Link href={`/orders/${order.id}`}>View Details</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {table.sales.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-slate-500 mb-4">No orders yet for this table.</p>
            <Button asChild>
              <Link href={`/orders/new?tableId=${table.id}`}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Order
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
