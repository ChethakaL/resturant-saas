import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import CategoriesPageClient from '@/app/(dashboard)/categories/CategoriesPageClient'
import { notFound } from 'next/navigation'

async function getCategoriesWithItems(restaurantId: string) {
  const categories = await prisma.category.findMany({
    where: { restaurantId },
    orderBy: { displayOrder: 'asc' },
    include: {
      menuItems: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      },
    },
  })
  return categories
}

export default async function CategoriesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    notFound()
  }

  const categories = await getCategoriesWithItems(session.user.restaurantId)

  return <CategoriesPageClient initialCategories={categories} />
}
