import { prisma } from '@/lib/prisma'
import CustomerMenu from '@/components/customer/CustomerMenu'

async function getMenuData() {
  const restaurant = await prisma.restaurant.findFirst({
    orderBy: { createdAt: 'asc' },
  })

  if (!restaurant) {
    return null
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { available: true, restaurantId: restaurant.id },
    include: { category: true },
    orderBy: [{ category: { displayOrder: 'asc' } }, { name: 'asc' }],
  })

  return { restaurant, menuItems }
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
    <CustomerMenu
      restaurantId={data.restaurant.id}
      restaurantName={data.restaurant.name}
      menuItems={data.menuItems}
    />
  )
}
