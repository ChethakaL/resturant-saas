'use client'

import { WaiterSidebar } from '@/components/layout/WaiterSidebar'
import { I18nProvider } from '@/lib/i18n'

interface WaiterLayoutClientProps {
  children: React.ReactNode
  userName: string
  restaurantName?: string
}

export function WaiterLayoutClient({ children, userName, restaurantName }: WaiterLayoutClientProps) {
  return (
    <I18nProvider>
      <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
        <WaiterSidebar userName={userName} restaurantName={restaurantName} />
        <div className="flex-1 min-h-0 overflow-auto bg-slate-50">
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </div>
      </div>
    </I18nProvider>
  )
}
