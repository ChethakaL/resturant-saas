import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import MenuForm from '../MenuForm'

export default async function NewMenuItemPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  // Run all DB queries in parallel for faster page load
  const [categories, ingredients, addOns, user] = await Promise.all([
    prisma.category.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
      // Only select fields MenuForm needs
      select: { id: true, name: true, displayOrder: true },
    }),
    prisma.ingredient.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      // Only select fields used in the recipe/cost calculations
      select: {
        id: true,
        name: true,
        unit: true,
        costPerUnit: true,
        supplier: true,
        minStockLevel: true,
        notes: true,
        preferredSupplierId: true,
      },
    }),
    prisma.addOn.findMany({
      where: { restaurantId, available: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, price: true, available: true },
    }),
    prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { defaultBackgroundPrompt: true, defaultBackgroundImageData: true },
    }),
  ])

  return (
    <MenuForm
      categories={categories as any}
      ingredients={ingredients as any}
      addOns={addOns as any}
      mode="create"
      defaultBackgroundPrompt={user?.defaultBackgroundPrompt ?? ''}
      hasDefaultBackgroundImage={Boolean(user?.defaultBackgroundImageData)}
    />
  )
}
