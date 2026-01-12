import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import MenuForm from '../MenuForm'

async function getMenuItemData(id: string, restaurantId: string) {
  const menuItem = await prisma.menuItem.findFirst({
    where: {
      id,
      restaurantId,
    },
    include: {
      ingredients: {
        include: {
          ingredient: true,
        },
      },
    },
  })

  if (!menuItem) {
    return null
  }

  const [categories, ingredients] = await Promise.all([
    prisma.category.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.ingredient.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    }),
  ])

  return { menuItem, categories, ingredients }
}

export default async function MenuItemEditPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const data = await getMenuItemData(params.id, restaurantId)

  if (!data) {
    notFound()
  }

  return (
    <MenuForm
      categories={data.categories}
      ingredients={data.ingredients}
      menuItem={data.menuItem}
      mode="edit"
    />
  )
}
