import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProfitLossPageClient from './ProfitLossPageClient'

export default async function ProfitLossPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/login')
  }

  if (session.user.role === 'STAFF') {
    redirect('/dashboard/orders')
  }

  return <ProfitLossPageClient />
}
