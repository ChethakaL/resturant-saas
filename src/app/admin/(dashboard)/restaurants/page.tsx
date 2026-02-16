import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AdminRestaurantsPage() {
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { users: true, sales: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Restaurants</h1>
        <p className="text-slate-600 mt-1">
          All registered restaurants. View only — no approval workflow.
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
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{r.name}</CardTitle>
                <CardDescription>
                  Slug: {r.slug}
                  {r.email && ` · ${r.email}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 space-y-1">
                <p>Users: {r._count.users}</p>
                <p>Orders: {r._count.sales}</p>
                {r.address && <p>{r.address}</p>}
                {r.phone && <p>{r.phone}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
