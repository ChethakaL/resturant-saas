import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import NewTableForm from './NewTableForm'

export default async function NewTablePage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.restaurantId) {
    redirect('/login')
  }

  const branches = await prisma.branch.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, address: true },
  })

  return <NewTableForm branches={branches} />
}
