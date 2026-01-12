import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import IngredientEditForm from './IngredientEditForm'

async function getIngredient(id: string, restaurantId: string) {
  const ingredient = await prisma.ingredient.findFirst({
    where: {
      id,
      restaurantId,
    },
    include: {
      stockAdjustments: {
        orderBy: { timestamp: 'desc' },
        take: 10,
      },
    },
  })

  return ingredient
}

export default async function IngredientEditPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const ingredient = await getIngredient(params.id, restaurantId)

  if (!ingredient) {
    notFound()
  }

  return <IngredientEditForm ingredient={ingredient} />
}
