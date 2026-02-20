import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WaiterLayoutClient } from './WaiterLayoutClient'

export default async function WaiterPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.type !== 'waiter') {
    redirect('/waiter/login')
  }

  return (
    <WaiterLayoutClient
      userName={session.user.name || 'Waiter'}
      restaurantName={session.user.restaurantName || undefined}
    >
      {children}
    </WaiterLayoutClient>
  )
}
