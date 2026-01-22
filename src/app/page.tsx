import { prisma } from '@/lib/prisma'
import SmartMenu from '@/components/customer/SmartMenu'

// Always fetch fresh menu data so admin changes show up immediately on the public menu
// export const dynamic = 'force-dynamic'

async function getMenuData() {
  const restaurant = await prisma.restaurant.findFirst({
    orderBy: { createdAt: 'asc' },
  })

  if (!restaurant) {
    return null
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { available: true, restaurantId: restaurant.id },
    include: {
      category: true,
      ingredients: {
        include: {
          ingredient: true,
        },
      },
    },
    orderBy: [{ popularityScore: 'desc' }, { name: 'asc' }],
  })

  const enrichedMenuItems = menuItems.map((item) => {
    const cost = item.ingredients.reduce(
      (sum, ing) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    const margin =
      item.price > 0 ? ((item.price - cost) / item.price) * 100 : 0

    const { ingredients, ...rest } = item
    return {
      ...rest,
      cost,
      margin,
      updatedAt: item.updatedAt.toISOString(),
    }
  })

  return { restaurant, menuItems: enrichedMenuItems }
}

export default async function Home() {
  const data = await getMenuData()

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-white/70">Menu is being prepared. Please check back soon.</p>
      </div>
    )
  }

  return (
    <SmartMenu
      restaurantId={data.restaurant.id}
      menuItems={data.menuItems}
    />
  )
}
