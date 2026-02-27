import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

function StatusBadge({ status }: { status: string | null }) {
  const s = status || 'none'
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    trialing: 'bg-blue-100 text-blue-800',
    canceled: 'bg-slate-100 text-slate-600',
    past_due: 'bg-amber-100 text-amber-800',
    none: 'bg-slate-100 text-slate-500',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colors[s] || 'bg-slate-100'}`}>
      {s}
    </span>
  )
}

export default async function AdminRestaurantsPage() {
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          users: true,
          sales: true,
          menuItems: true,
          menuEvents: true,
        },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Restaurants</h1>
        <p className="text-slate-600 mt-1">
          All registered restaurants. Click a card to view details, manage subscription, and users.
        </p>
      </div>

      {restaurants.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-slate-600 text-center py-8">No restaurants yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {restaurants.map((r) => (
            <Link key={r.id} href={`/admin/restaurants/${r.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{r.name}</CardTitle>
                    <CardDescription>
                      {r.slug}
                      {r.email && ` · ${r.email}`}
                    </CardDescription>
                  </div>
                  <StatusBadge status={r.subscriptionStatus} />
                </CardHeader>
                <CardContent className="text-sm text-slate-600 space-y-1">
                  <p>Users: {r._count.users}</p>
                  <p>Orders: {r._count.sales}</p>
                  <p>Menu items: {r._count.menuItems}</p>
                  <p>Menu events: {r._count.menuEvents.toLocaleString()}</p>
                  {r.currentPeriodEnd && (
                    <p className="text-xs text-slate-500">
                      Period ends: {new Date(r.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-2">
                    Joined {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
