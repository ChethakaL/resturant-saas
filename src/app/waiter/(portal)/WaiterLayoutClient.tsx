'use client'

import { WaiterSidebar } from '@/components/layout/WaiterSidebar'

interface WaiterLayoutClientProps {
  children: React.ReactNode
  userName: string
  restaurantName?: string
}

export function WaiterLayoutClient({ children, userName, restaurantName }: WaiterLayoutClientProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <WaiterSidebar userName={userName} restaurantName={restaurantName} />
      <div className="flex-1 min-h-0 overflow-auto bg-slate-50">
        <div className="p-8">{children}</div>
      </div>
    </div>
  )
}
