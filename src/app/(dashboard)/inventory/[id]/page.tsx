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
  params: Promise<{ id: string }> | { id: string }
}) {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  // Handle both Promise and direct params (Next.js 15 compatibility)
  const resolvedParams = params instanceof Promise ? await params : params
  const ingredient = await getIngredient(resolvedParams.id, restaurantId)

  if (!ingredient) {
    notFound()
  }

  return <IngredientEditForm ingredient={ingredient} />
}
