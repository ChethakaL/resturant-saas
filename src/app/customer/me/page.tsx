import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CustomerSignOut } from './CustomerSignOut'

async function getCustomerVisits(customerId: string) {
  const sales = await prisma.sale.findMany({
    where: { customerId },
    include: {
      restaurant: { select: { id: true, name: true, slug: true, logo: true } },
      items: { include: { menuItem: { select: { id: true, name: true, price: true, imageUrl: true } } } },
    },
    orderBy: { timestamp: 'desc' },
  })

  const byRestaurant = new Map<
    string,
    {
      restaurant: { id: string; name: string; slug: string; logo: string | null }
      orderCount: number
      lastOrderAt: Date
      itemCounts: Map<string, { menuItem: { id: string; name: string; price: number; imageUrl: string | null }; totalQuantity: number }>
    }
  >()

  for (const sale of sales) {
    const r = sale.restaurant
    const existing = byRestaurant.get(r.id)
    if (!existing) {
      byRestaurant.set(r.id, {
        restaurant: r,
        orderCount: 1,
        lastOrderAt: sale.timestamp,
        itemCounts: new Map(),
      })
    } else {
      existing.orderCount += 1
      if (sale.timestamp > existing.lastOrderAt) existing.lastOrderAt = sale.timestamp
    }
    const row = byRestaurant.get(r.id)!
    for (const si of sale.items) {
      const cur = row.itemCounts.get(si.menuItemId)
      if (!cur) {
        row.itemCounts.set(si.menuItemId, { menuItem: si.menuItem, totalQuantity: si.quantity })
      } else {
        cur.totalQuantity += si.quantity
      }
    }
  }

  return Array.from(byRestaurant.entries()).map(([restaurantId, v]) => ({
    restaurantId,
    restaurant: v.restaurant,
    orderCount: v.orderCount,
    lastOrderAt: v.lastOrderAt.toISOString(),
    recommendedItems: Array.from(v.itemCounts.entries())
      .map(([menuItemId, { menuItem, totalQuantity }]) => ({ menuItemId, menuItem, totalQuantity }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 8),
  }))
}

export default async function CustomerMePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.type !== 'customer') {
    redirect('/customer/login?callbackUrl=/customer/me')
  }

  const visits = await getCustomerVisits(session.user.id)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">My visits</h1>
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="outline" size="sm">
              Menu
            </Button>
          </Link>
          <CustomerSignOut />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <p className="text-slate-600 text-sm">
          Signed in as <span className="font-medium text-slate-900">{session.user.email}</span>. Your orders are linked to this account so we can show recommendations.
        </p>

        {visits.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-slate-600 text-center py-8">
                You haven’t placed any orders yet while signed in. Order from a restaurant’s menu and your visits will appear here with recommendations.
              </p>
              <div className="flex justify-center">
                <Link href="/">
                  <Button>Browse menu</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <h2 className="text-base font-semibold text-slate-900">Restaurants you’ve visited</h2>
            {visits.map((v) => (
              <Card key={v.restaurantId}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {v.restaurant.logo ? (
                      <img
                        src={v.restaurant.logo}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500 text-lg font-semibold">
                        {v.restaurant.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-lg">{v.restaurant.name}</CardTitle>
                      <CardDescription>
                        {v.orderCount} order{v.orderCount !== 1 ? 's' : ''} · Last visit{' '}
                        {new Date(v.lastOrderAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link href="/" className="block">
                    <Button variant="outline" size="sm" className="w-full">
                      View menu & order again
                    </Button>
                  </Link>
                  {v.recommendedItems.length > 0 && (
                    <>
                      <p className="text-sm font-medium text-slate-700 pt-2">You often order</p>
                      <ul className="space-y-1">
                        {v.recommendedItems.map(({ menuItem, totalQuantity }) => (
                          <li
                            key={menuItem.id}
                            className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0"
                          >
                            <span className="text-slate-800">{menuItem.name}</span>
                            <span className="text-slate-500">
                              {totalQuantity}× ordered
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
