import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import RestaurantDetailClient from './RestaurantDetailClient'

export default async function AdminRestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.type !== 'superadmin') {
    notFound()
  }

  const { id } = await params

  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, email: true, name: true, role: true, isActive: true } },
      _count: {
        select: {
          menuItems: true,
          sales: true,
          menuEvents: true,
          categories: true,
        },
      },
    },
  })

  if (!restaurant) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/restaurants"
          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to restaurants
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{restaurant.name}</h1>
        <p className="text-slate-600 mt-1">
          {restaurant.slug}
          {restaurant.email && ` · ${restaurant.email}`}
        </p>
      </div>

      <RestaurantDetailClient
        restaurant={{
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          email: restaurant.email,
          phone: restaurant.phone,
          address: restaurant.address,
          subscriptionStatus: restaurant.subscriptionStatus,
          currentPeriodEnd: restaurant.currentPeriodEnd?.toISOString() ?? null,
          stripeCustomerId: restaurant.stripeCustomerId,
          stripeSubscriptionId: restaurant.stripeSubscriptionId,
          createdAt: restaurant.createdAt.toISOString(),
        }}
        users={restaurant.users}
        counts={{
          menuItems: restaurant._count.menuItems,
          sales: restaurant._count.sales,
          menuEvents: restaurant._count.menuEvents,
          categories: restaurant._count.categories,
        }}
      />
    </div>
  )
}
