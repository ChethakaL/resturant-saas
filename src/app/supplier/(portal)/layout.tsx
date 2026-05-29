import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SupplierShell } from '@/components/layout/SupplierShell'

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
    <SupplierShell supplierName={session.user.supplierName ?? 'Supplier'}>
      {children}
    </SupplierShell>
  )
}
