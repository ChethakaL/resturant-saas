'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import {
  Home,
  UtensilsCrossed,
  ShoppingCart,
  Receipt,
  Package,
  LogOut,
  Settings,
  TrendingUp,
  Users,
  Clock,
  Wallet,
  Zap,
  Square,
  CreditCard,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, disabled: false },
  { name: 'Add Menu Items', href: '/menu', icon: UtensilsCrossed, disabled: false },
  { name: 'Optimize your menu sales', href: '/menu?tab=optimization', icon: Zap, disabled: false },
  { name: 'Restaurant Theme and Design', href: '/settings', icon: Settings, disabled: false },
  { name: 'P&L and Sales Reports', href: '/profit-loss', icon: TrendingUp, disabled: false },
  { name: 'Inventory', href: '/inventory', icon: Package, disabled: false },
  { name: 'Tables', href: '/tables', icon: Square, disabled: false },
  { name: 'Sales POS', href: '/orders/new', icon: ShoppingCart, disabled: true, comingSoon: true },
  { name: 'Orders', href: '/orders', icon: Receipt, disabled: true, comingSoon: true },
  { name: 'HR', href: '/hr/employees', icon: Users, disabled: true, comingSoon: true },
  { name: 'Shifts', href: '/hr/shifts', icon: Clock, disabled: true, comingSoon: true },
  { name: 'Payroll', href: '/hr/payroll', icon: Wallet, disabled: true, comingSoon: true },
]

interface SidebarProps {
  userName: string
  userRole: string
}

export function Sidebar({ userName, userRole }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const visibleNavigation =
    userRole === 'STAFF'
      ? navigation.filter((item) =>
        ['Sales POS', 'Orders', 'Add Menu Items', 'Meal Prep'].includes(item.name)
      )
      : navigation

  return (
    <div className="flex h-full min-h-full flex-col bg-slate-900 text-white w-64 shrink-0 self-stretch">
      {/* Header */}
      <div className="p-6 flex flex-col items-center">
        <Image
          src="/logo.png"
          alt="iServe+"
          width={140}
          height={50}
          className="h-12 w-auto rounded-full"
          priority
        />
        <p className="text-xs text-slate-400 mt-2 uppercase tracking-wider">{userRole}</p>
      </div>

      <Separator className="bg-slate-700" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {visibleNavigation.map((item) => {
          const hrefPath = item.href.split('?')[0]
          const hrefTab = item.href.includes('?tab=') ? item.href.split('?tab=')[1] : null
          const isActive =
            !item.disabled &&
            (pathname === hrefPath || pathname?.startsWith(hrefPath + '/'))
              ? hrefTab
                ? searchParams.get('tab') === hrefTab
                : !searchParams.get('tab')
              : false

          if (item.disabled) {
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 px-4 py-3 rounded-lg opacity-40 cursor-not-allowed select-none"
                title="Coming soon"
              >
                <item.icon className="h-5 w-5 text-slate-500" />
                <span className="font-medium text-slate-500">{item.name}</span>
                {item.comingSoon && (
                  <span className="ml-auto text-[10px] font-semibold bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">SOON</span>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      <Separator className="bg-slate-700" />

      {/* User Section */}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 px-1 py-1">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-slate-400">{userRole}</p>
          </div>
          <Link
            href="/billing"
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors shrink-0',
              pathname === '/billing' || pathname === '/dashboard/billing'
                ? 'bg-slate-800 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )}
            title="Subscription"
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>Subscription</span>
          </Link>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          style={{ color: 'black' }}
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="h-4 w-4 mr-2 text-black" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
