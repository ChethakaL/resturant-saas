'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UtensilsCrossed, Zap } from 'lucide-react'
import MenuOptimizationContent, { type MenuOptimizationContentProps } from './MenuOptimizationContent'

interface MenuPageTabsProps extends MenuOptimizationContentProps {
  children: React.ReactNode
}

export default function MenuPageTabs({ children, ...optimizationProps }: MenuPageTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tabFromUrl = searchParams.get('tab')
  const value = tabFromUrl === 'optimization' ? 'menu-optimization' : 'menu-engineering'

  const onTabChange = (newValue: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (newValue === 'menu-optimization') {
      params.set('tab', 'optimization')
    } else {
      params.delete('tab')
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <Tabs value={value} onValueChange={onTabChange} className="space-y-4">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="menu-engineering" className="gap-2">
          <UtensilsCrossed className="h-4 w-4" />
          Menu engineering
        </TabsTrigger>
        <TabsTrigger value="menu-optimization" className="gap-2">
          <Zap className="h-4 w-4" />
          Menu optimization
        </TabsTrigger>
      </TabsList>
      <TabsContent value="menu-engineering" className="mt-4">
        {children}
      </TabsContent>
      <TabsContent value="menu-optimization" className="mt-4">
        <MenuOptimizationContent {...optimizationProps} />
      </TabsContent>
    </Tabs>
  )
}
