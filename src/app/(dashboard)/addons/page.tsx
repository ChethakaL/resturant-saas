import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AddOnsClient from './AddOnsClient'

async function getAddOns(restaurantId: string) {
  const addOns = await prisma.addOn.findMany({
    where: { restaurantId },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { menuItems: true },
      },
    },
  })
  return addOns
}

export default async function AddOnsPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

  const addOns = await getAddOns(restaurantId)

  return <AddOnsClient addOns={addOns} />
}
