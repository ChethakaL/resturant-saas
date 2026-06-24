import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { cn } from '@/lib/utils'
import OrderDetailActions from './OrderDetailActions'
import CompleteOrderButton from '@/components/orders/CompleteOrderButton'
import Link from 'next/link'

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

export default async function OrderDetailsPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const order = await prisma.sale.findFirst({
    where: {
      id: params.id,
      restaurantId,
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
      table: true,
      waiter: true,
      void: {
        include: {
          performedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  })

  if (!order) {
    notFound()
  }

  const totalCost = order.items.reduce(
    (sum, item) => sum + item.cost * item.quantity,
    0
  )
  const profit = order.total - totalCost
  const margin = order.total > 0 ? (profit / order.total) * 100 : 0

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('en-IQ', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(date)

  const voidReasonLabels: Record<string, string> = {
    MIS_RING_WRONG_ITEM: 'Mis-ring / wrong item',
    WRONG_TABLE: 'Wrong table',
    CUSTOMER_WALKOUT: 'Customer walkout',
    COMP_STAFF_MEAL: 'Comp / staff meal',
    KITCHEN_ERROR: 'Kitchen error',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/orders">
            <Button variant="ghost" size="sm" className="mb-3 -ml-3">
              Back to Orders
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">{order.orderNumber}</h1>
          <p className="text-slate-500 mt-1">{formatDate(order.timestamp)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={cn(
              'inline-flex px-3 py-1 rounded-full text-xs font-medium',
              getStatusBadge(order.status)
            )}
          >
            {order.status}
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            {order.status === 'PENDING' && <CompleteOrderButton order={order} />}
            <OrderDetailActions
              orderId={order.id}
              status={order.status}
              userRole={session!.user.role}
              isVoided={Boolean(order.void)}
            />
          </div>
        </div>
      </div>

      {order.void && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">Order Voided</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-red-950 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs font-medium uppercase text-red-700">Reason</div>
              <div>{voidReasonLabels[order.void.reason] || order.void.reason}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-red-700">Voided by</div>
              <div>{order.void.performedBy.name || order.void.performedBy.email}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-red-700">Timestamp</div>
              <div>{formatDate(order.void.voidedAt)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-red-700">Inventory</div>
              <div>{order.void.restoresInventory ? 'Stock restored' : 'Stock not restored'}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Order Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(order.total)}</div>
            <p className="text-xs text-slate-500 mt-1">Payment: {order.paymentMethod}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(profit)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Margin {formatPercentage(margin)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {order.items.reduce((sum, item) => sum + item.quantity, 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {order.customerName ? `Customer: ${order.customerName}` : 'Walk-in'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Item
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Category
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Quantity
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Price
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Line Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">
                        {item.menuItem.name}
                      </div>
                      {item.menuItem.description && (
                        <div className="text-sm text-slate-500 line-clamp-1">
                          {item.menuItem.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {item.menuItem.category?.name || 'Uncategorized'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{item.quantity}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(item.price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium">
                      {formatCurrency(item.price * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {(order.table || order.waiter || order.notes) && (
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.table && (
              <div>
                <span className="text-sm text-slate-500">Table:</span>{' '}
                <span className="text-sm font-medium">Table {order.table.number}</span>
              </div>
            )}
            {order.waiter && (
              <div>
                <span className="text-sm text-slate-500">Waiter:</span>{' '}
                <span className="text-sm font-medium">{order.waiter.name}</span>
              </div>
            )}
            {order.notes && (
              <div>
                <span className="text-sm text-slate-500">Notes:</span>{' '}
                <span className="text-sm font-medium">{order.notes}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
