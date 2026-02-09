'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  Store,
  BarChart3,
  MapPin,
  LogOut,
  ShoppingCart,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const navigation = [
  { name: 'Dashboard', href: '/supplier', icon: LayoutDashboard },
  { name: 'My Products', href: '/supplier/products', icon: Package },
  { name: 'Stock requests', href: '/supplier/stock-requests', icon: ShoppingCart },
  { name: 'Restaurants', href: '/supplier/restaurants', icon: Store },
  { name: 'Analytics', href: '/supplier/analytics', icon: BarChart3 },
  { name: 'Map', href: '/supplier/map', icon: MapPin },
]

interface SupplierSidebarProps {
  supplierName: string
}

export function SupplierSidebar({ supplierName }: SupplierSidebarProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white w-64">
      <div className="p-6 flex flex-col items-center">
        <div className="text-lg font-semibold text-amber-400">Supplier Portal</div>
        <p className="text-xs text-slate-400 mt-1 truncate w-full text-center">{supplierName}</p>
      </div>
      <Separator className="bg-slate-700" />
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/supplier' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.name}
            </Link>
          )
        })}
      </nav>
      <Separator className="bg-slate-700" />
      <div className="p-4">
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
          onClick={() => signOut({ callbackUrl: '/supplier/login' })}
        >
          <LogOut className="h-5 w-5 mr-3" />
          Sign out
        </Button>
      </div>
    </div>
  )
}
