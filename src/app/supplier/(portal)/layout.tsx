import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SupplierSidebar } from '@/components/layout/SupplierSidebar'

export default async function SupplierPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/supplier/login')
  }

  if (session.user.type !== 'supplier' || !session.user.supplierId) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SupplierSidebar supplierName={session.user.supplierName ?? 'Supplier'} />
      <main className="flex-1 min-h-0 overflow-auto bg-slate-50">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
