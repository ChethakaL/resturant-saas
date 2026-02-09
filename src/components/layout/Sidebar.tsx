'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import {
  Home,
  UtensilsCrossed,
  ShoppingCart,
  Receipt,
  Package,
  LogOut,
  PlusCircle,
  Layers,
  Settings,
  TrendingUp,
  Users,
  Clock,
  Wallet,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Menu', href: '/menu', icon: UtensilsCrossed },
  { name: 'Add-ons', href: '/addons', icon: PlusCircle },
  { name: 'Categories', href: '/categories', icon: Layers },
  { name: 'Sales POS', href: '/orders/new', icon: ShoppingCart },
  { name: 'Orders', href: '/orders', icon: Receipt },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'HR', href: '/hr/employees', icon: Users },
  { name: 'Shifts', href: '/hr/shifts', icon: Clock },
  { name: 'Payroll', href: '/hr/payroll', icon: Wallet },
  { name: 'P&L', href: '/profit-loss', icon: TrendingUp },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface SidebarProps {
  userName: string
  userRole: string
}

export function Sidebar({ userName, userRole }: SidebarProps) {
  const pathname = usePathname()
  const visibleNavigation =
    userRole === 'STAFF'
      ? navigation.filter((item) =>
          ['Sales POS', 'Orders', 'Menu', 'Meal Prep'].includes(item.name)
        )
      : navigation

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white w-64">
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
      <nav className="flex-1 p-4 space-y-1">
        {visibleNavigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
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
      <div className="p-4">
        <div className="mb-3">
          <p className="text-sm font-medium">{userName}</p>
          <p className="text-xs text-slate-400">{userRole}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          style={{color: 'black'}}
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="h-4 w-4 mr-2 text-black"  />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
