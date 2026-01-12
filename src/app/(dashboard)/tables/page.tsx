import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

async function getTables(restaurantId: string) {
  const tables = await prisma.table.findMany({
    where: { restaurantId },
    include: {
      sales: {
        where: {
          status: {
            in: ['PENDING', 'PREPARING', 'READY'],
          },
        },
        include: {
          items: {
            include: {
              menuItem: true,
            },
          },
          waiter: true,
        },
      },
    },
    orderBy: { number: 'asc' },
  })

  return tables
}

function getStatusColor(status: string) {
  switch (status) {
    case 'AVAILABLE':
      return 'bg-green-100 text-green-800 border-green-300'
    case 'OCCUPIED':
      return 'bg-amber-100 text-amber-800 border-amber-300'
    case 'RESERVED':
      return 'bg-blue-100 text-blue-800 border-blue-300'
    case 'CLEANING':
      return 'bg-slate-100 text-slate-800 border-slate-300'
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300'
  }
}

export default async function TablesPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const tables = await getTables(restaurantId)

  const stats = {
    total: tables.length,
    available: tables.filter((t) => t.status === 'AVAILABLE').length,
    occupied: tables.filter((t) => t.status === 'OCCUPIED').length,
    reserved: tables.filter((t) => t.status === 'RESERVED').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Tables</h1>
          <p className="text-slate-500 mt-1">Manage your restaurant tables and seating</p>
        </div>
        <Button asChild>
          <Link href="/tables/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Table
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Tables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.available}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600">Occupied</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.occupied}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Reserved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.reserved}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {tables.map((table) => {
          const activeOrder = table.sales[0]
          const orderTotal = activeOrder?.total || 0

          return (
            <Link key={table.id} href={`/tables/${table.id}`}>
              <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 ${getStatusColor(table.status)}`}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">Table {table.number}</CardTitle>
                      <p className="text-sm text-slate-600 mt-1">{table.capacity} seats</p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded">
                      {table.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeOrder ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Order:</span>
                        <span className="font-medium">{activeOrder.orderNumber}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Waiter:</span>
                        <span className="font-medium">{activeOrder.waiter?.name || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Total:</span>
                        <span className="font-bold text-green-600">{formatCurrency(orderTotal)}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t">
                        <span className={`text-xs px-2 py-1 rounded ${
                          activeOrder.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                          activeOrder.status === 'PREPARING' ? 'bg-blue-100 text-blue-800' :
                          activeOrder.status === 'READY' ? 'bg-green-100 text-green-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {activeOrder.status}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-4">
                      No active orders
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {tables.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-slate-500 mb-4">No tables found. Add your first table to get started.</p>
            <Button asChild>
              <Link href="/tables/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Table
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
