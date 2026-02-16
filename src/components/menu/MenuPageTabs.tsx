'use client'

import { useSearchParams } from 'next/navigation'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import MenuOptimizationContent, { type MenuOptimizationContentProps } from './MenuOptimizationContent'

interface MenuPageTabsProps extends MenuOptimizationContentProps {
  children: React.ReactNode
}

/**
 * Menu content is driven by URL only; no tab UI on the page.
 * Sidebar: "Add Menu Items" -> /menu (engineering), "Optimize your menu sales" -> /menu?tab=optimization
 */
export default function MenuPageTabs({ children, ...optimizationProps }: MenuPageTabsProps) {
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const value = tabFromUrl === 'optimization' ? 'menu-optimization' : 'menu-engineering'

  return (
    <Tabs value={value} className="space-y-4">
      <TabsContent value="menu-engineering" className="mt-0">
        {children}
      </TabsContent>
      <TabsContent value="menu-optimization" className="mt-0">
        <MenuOptimizationContent {...optimizationProps} />
      </TabsContent>
    </Tabs>
  )
}
