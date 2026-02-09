'use client'

import dynamic from 'next/dynamic'

const SupplierMapClient = dynamic(() => import('./SupplierMapClient'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[300px]">
      <p className="text-slate-500">Loading map...</p>
    </div>
  ),
})

export default function SupplierMapPage() {
  return <SupplierMapClient />
}
