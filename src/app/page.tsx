import { prisma } from '@/lib/prisma'
import SmartMenu from '@/components/customer/SmartMenu'
import { unstable_noStore as noStore } from 'next/cache'

async function getMenuData() {
  // Opt out of caching - always fetch fresh menu data from database
  noStore()

  const restaurant = await prisma.restaurant.findFirst({
    orderBy: { createdAt: 'asc' },
  })

  if (!restaurant) {
    return null
  }

  const menuItems = (await prisma.menuItem.findMany({
    where: { available: true, restaurantId: restaurant.id },
    include: {
      category: true,
      ingredients: {
        include: {
          ingredient: true,
        },
      },
      addOns: {
        include: {
          addOn: true,
        },
      },
    },
    orderBy: [{ popularityScore: 'desc' }, { name: 'asc' }],
  })) as any[]

  const enrichedMenuItems = menuItems.map((item: any) => {
    const cost = item.ingredients.reduce(
      (sum: number, ing: any) => sum + ing.quantity * ing.ingredient.costPerUnit,
      0
    )
    const margin =
      item.price > 0 ? ((item.price - cost) / item.price) * 100 : 0

    const { ingredients, addOns: menuItemAddOns, ...rest } = item
    return {
      ...rest,
      cost,
      margin,
      updatedAt: item.updatedAt.toISOString(),
      addOns: menuItemAddOns
        .filter((ma: any) => ma.addOn.available)
        .map((ma: any) => ({
          id: ma.addOn.id,
          name: ma.addOn.name,
          price: ma.addOn.price,
          description: ma.addOn.description,
        })),
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
