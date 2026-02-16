import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/admin/login')
  }

  if (session.user.type !== 'superadmin') {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
        <nav className="flex items-center gap-4">
          <Link href="/admin/restaurants" className="font-semibold text-slate-900">
            Super Admin
          </Link>
          <Link href="/admin/restaurants" className="text-slate-600 hover:text-slate-900 text-sm">
            Restaurants
          </Link>
        </nav>
        <span className="text-sm text-slate-500">{session.user.email}</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
