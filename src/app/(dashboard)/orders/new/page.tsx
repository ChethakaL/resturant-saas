import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import NewOrderForm from './NewOrderForm'

async function getOrderFormData(restaurantId: string) {
  const [menuItems, categories, tables] = await Promise.all([
    prisma.menuItem.findMany({
      where: {
        restaurantId,
        available: true,
      },
      include: {
        category: true,
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.table.findMany({
      where: { restaurantId },
      orderBy: { number: 'asc' },
    }),
  ])

  return { menuItems, categories, tables }
}

export default async function NewOrderPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const data = await getOrderFormData(restaurantId)

  return <NewOrderForm menuItems={data.menuItems} categories={data.categories} tables={data.tables} />
}
