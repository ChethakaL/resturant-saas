import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
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
        price: true,
        categoryId: true,
        mediaAssetId: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        ingredients: {
          select: {
            quantity: true,
            ingredient: {
              select: {
                costPerUnit: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
      },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.table.findMany({
      where: { restaurantId },
      select: {
        id: true,
        number: true,
        capacity: true,
        status: true,
      },
      orderBy: { number: 'asc' },
    }),
  ])

  return {
    menuItems: menuItems.map(({ mediaAssetId, ...item }) => ({
      ...item,
      imageUrl: mediaAssetId
        ? `/api/media-assets/${mediaAssetId}/image`
        : `/api/public/menu-item-image?id=${encodeURIComponent(item.id)}`,
    })),
    categories,
    tables,
  }
}

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams?: { tableId?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    redirect('/login')
  }

  const restaurantId = session.user.restaurantId

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
