'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Square, Receipt, LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const navigation = [
  { name: 'Tables', href: '/waiter/dashboard', icon: Square },
  { name: 'My Orders', href: '/waiter/dashboard?tab=orders', icon: Receipt },
]

interface WaiterSidebarProps {
  userName: string
  restaurantName?: string
}

export function WaiterSidebar({ userName, restaurantName }: WaiterSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white w-64">
      <div className="p-6 flex flex-col items-center">
        <Image
          src="/logo.png"
          alt="iServe+"
          width={140}
          height={50}
          className="h-12 w-auto rounded-full"
          priority
        />
        <p className="text-xs text-slate-400 mt-2 uppercase tracking-wider">WAITER</p>
      </div>

      <Separator className="bg-slate-700" />

      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isOrders = item.href.includes('tab=orders')
          const tab = searchParams?.get('tab')
          const isActive = isOrders
            ? pathname === '/waiter/dashboard' && tab === 'orders'
            : pathname === '/waiter/dashboard' && tab !== 'orders'
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      <Separator className="bg-slate-700" />

      <div className="p-4">
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
          Sign Out
        </Button>
      </div>
    </div>
  )
}
