import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import MenuForm from '../MenuForm'

async function getFormData(restaurantId: string) {
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

  return { categories, ingredients }
}

export default async function NewMenuItemPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const data = await getFormData(restaurantId)

  return (
    <MenuForm
      categories={data.categories}
      ingredients={data.ingredients}
      mode="create"
    />
  )
}
