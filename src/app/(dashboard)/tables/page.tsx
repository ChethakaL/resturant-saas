import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import TablesClient from './TablesClient'

export default async function TablesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    redirect('/login')
  }
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: { slug: true },
  })
  const baseUrl = (process.env.NEXTAUTH_URL || '').trim().replace(/\/+$/, '') || 'http://localhost:3000'
  const menuBaseUrl = `${baseUrl}/${restaurant?.slug ?? ''}`

  return <TablesClient menuBaseUrl={menuBaseUrl} />
}
