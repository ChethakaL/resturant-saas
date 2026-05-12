'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Square, Receipt, LogOut, ChefHat } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useI18n } from '@/lib/i18n'

interface WaiterSidebarProps {
  userName: string
  restaurantName?: string
}

export function WaiterSidebar({ userName, restaurantName }: WaiterSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t } = useI18n()

  const navigation = [
    { name: t.waiter_tables, href: '/waiter/dashboard', icon: Square },
    { name: t.waiter_my_orders, href: '/waiter/dashboard?tab=orders', icon: Receipt },
    { name: t.waiter_chefs, href: '/waiter/dashboard?tab=kitchen', icon: ChefHat },
  ]

  return (
    <div className="flex shrink-0 flex-col bg-slate-900 text-white md:h-full md:w-64">
      <div className="flex items-center gap-3 px-4 py-3 md:flex-col md:gap-0 md:p-6">
        <div className="flex flex-1 items-center gap-3 md:flex-col md:gap-0">
          <img
            src="/logo.png"
            alt="iServe+"
            className="h-10 w-auto rounded-full md:h-12"
          />
          <p className="text-xs text-slate-400 uppercase tracking-wider md:mt-2">{t.waiter_role_label}</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-white/10 p-2 text-slate-200 md:hidden"
          onClick={() => signOut({ callbackUrl: '/waiter/login' })}
          aria-label={t.waiter_sign_out}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <Separator className="bg-slate-700" />

      <nav className="flex gap-2 overflow-x-auto p-3 md:flex-1 md:flex-col md:overflow-y-auto md:p-4 md:space-y-1">
        {navigation.map((item) => {
          const isOrders = item.href.includes('tab=orders')
          const isKitchen = item.href.includes('tab=kitchen')
          const tab = searchParams?.get('tab')
          const isActive = isOrders
            ? pathname === '/waiter/dashboard' && tab === 'orders'
            : isKitchen
              ? pathname === '/waiter/dashboard' && tab === 'kitchen'
              : pathname === '/waiter/dashboard' && tab !== 'orders' && tab !== 'kitchen'
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors md:gap-3 md:px-4 md:py-3 md:text-base',
                isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="font-medium">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      <Separator className="hidden bg-slate-700 md:block" />

      <div className="hidden p-4 md:block">
        <div className="mb-3">
          <p className="text-sm font-medium">{userName}</p>
          {restaurantName && <p className="text-xs text-slate-400">{restaurantName}</p>}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          style={{ color: 'black' }}
          onClick={() => signOut({ callbackUrl: '/waiter/login' })}
        >
          <LogOut className="h-4 w-4 mr-2 text-black" />
          {t.waiter_sign_out}
        </Button>
      </div>
    </div>
  )
}
