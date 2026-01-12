'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  UtensilsCrossed,
  ShoppingCart,
  BarChart3,
  Settings,
  LogOut,
  Grid3x3,
  Users,
  DollarSign,
  Calendar,
  ChefHat,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Profit & Loss', href: '/profit-loss', icon: DollarSign },
  { name: 'Meal Prep', href: '/meal-prep', icon: ChefHat },
  { name: 'Tables', href: '/tables', icon: Grid3x3 },
  { name: 'Orders', href: '/orders', icon: ShoppingCart },
  { name: 'Menu', href: '/menu', icon: UtensilsCrossed },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'HR & Staff', href: '/hr/employees', icon: Users },
  { name: 'Payroll', href: '/hr/payroll', icon: DollarSign },
  { name: 'Shifts', href: '/hr/shifts', icon: Calendar },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface SidebarProps {
  restaurantName: string
  userName: string
  userRole: string
}

export function Sidebar({ restaurantName, userName, userRole }: SidebarProps) {
  const pathname = usePathname()
  const visibleNavigation =
    userRole === 'STAFF'
      ? navigation.filter((item) =>
          ['Tables', 'Orders', 'Menu', 'Meal Prep'].includes(item.name)
        )
      : navigation

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white w-64">
      {/* Header */}
      <div className="p-6">
        <h1 className="text-xl font-bold">{restaurantName}</h1>
        <p className="text-sm text-slate-400 mt-1">{userRole}</p>
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
