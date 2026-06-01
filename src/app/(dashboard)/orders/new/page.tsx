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
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        categoryId: true,
        available: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        restaurantId: true,
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            displayOrder: true,
            showOnMenu: true,
            createdAt: true,
            updatedAt: true,
            restaurantId: true,
          },
        },
        ingredients: {
          select: {
            id: true,
            menuItemId: true,
            ingredientId: true,
            quantity: true,
            ingredient: {
              select: {
                id: true,
                name: true,
                unit: true,
                costPerUnit: true,
                restaurantId: true,
                createdAt: true,
                updatedAt: true,
              },
            },
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

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams?: { tableId?: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const data = await getOrderFormData(restaurantId)

  return (
    <NewOrderForm
      menuItems={data.menuItems}
      categories={data.categories}
      tables={data.tables}
      initialTableId={searchParams?.tableId}
    />
  )
}
