import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  if (session?.user?.type === 'superadmin') {
    redirect('/admin/dashboard')
  }
  redirect('/admin/login')
}
