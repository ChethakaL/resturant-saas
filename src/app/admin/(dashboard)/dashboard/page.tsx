import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Building2, Users, ShoppingCart, TrendingUp, Activity } from 'lucide-react'

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.type !== 'superadmin') {
    redirect('/admin/login')
  }

  const [restaurantCount, restaurants, menuEventCount, userCount] = await Promise.all([
    prisma.restaurant.count(),
    prisma.restaurant.findMany({
      select: { subscriptionStatus: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.menuEvent.count(),
    prisma.user.count(),
  ])

  const bySubscription = restaurants.reduce(
    (acc, r) => {
      const s = r.subscriptionStatus || 'none'
      acc[s] = (acc[s] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const thisMonth = new Date()
  thisMonth.setDate(1)
  thisMonth.setHours(0, 0, 0, 0)
  const newThisMonth = restaurants.filter((r) => new Date(r.createdAt) >= thisMonth).length

  const activeCount = (bySubscription.active || 0) + (bySubscription.trialing || 0)
  const noneCount = bySubscription.none ?? Math.max(0, restaurantCount - activeCount - (bySubscription.canceled || 0) - (bySubscription.past_due || 0))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Super Admin Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Overview of restaurants, subscriptions, and platform activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Total Restaurants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{restaurantCount}</div>
            <p className="text-xs text-slate-500 mt-1">+{newThisMonth} this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Active Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
            <p className="text-xs text-slate-500 mt-1">
              {bySubscription.active || 0} active, {bySubscription.trialing || 0} trialing
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userCount}</div>
            <p className="text-xs text-slate-500 mt-1">Restaurant staff accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Menu Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{menuEventCount.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">Guest menu activity</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Without Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{noneCount}</div>
            <p className="text-xs text-slate-500 mt-1">No active plan</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Link
          href="/admin/restaurants"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium"
        >
          <Building2 className="h-4 w-4" />
          View All Restaurants
        </Link>
      </div>
    </div>
  )
}
