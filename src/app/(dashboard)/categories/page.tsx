import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import CategoriesManager from '@/components/dashboard/CategoriesManager'
import { notFound } from 'next/navigation'

async function getCategories(restaurantId: string) {
  const categories = await prisma.category.findMany({
    where: { restaurantId },
    orderBy: { displayOrder: 'asc' },
  })

  return categories
}

export default async function CategoriesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    notFound()
  }

  const categories = await getCategories(session.user.restaurantId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Category Manager</h1>
        <p className="text-slate-500 mt-1">
          Create and clean up the sections that organize your menu.
        </p>
      </div>
      <CategoriesManager initialCategories={categories} />
    </div>
  )
}
