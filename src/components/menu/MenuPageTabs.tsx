'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import MenuOptimizationContent, { type MenuOptimizationContentProps } from './MenuOptimizationContent'
import { Loader2 } from 'lucide-react'

interface MenuPageTabsProps extends Omit<MenuOptimizationContentProps, 'showcases' | 'menuItems'> {
  children: React.ReactNode
}

/**
 * Menu content is driven by URL only; no tab UI on the page.
 * Sidebar: "Add Menu Items" -> /menu (engineering), "Optimize your menu sales" -> /menu?tab=optimization
 * Optimization tab data (showcases, menuItems) is fetched client-side when the tab is opened to keep initial page load fast.
 */
export default function MenuPageTabs({ children, ...rest }: MenuPageTabsProps) {
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const value = tabFromUrl === 'optimization' ? 'menu-optimization' : 'menu-engineering'

  const [optimizationData, setOptimizationData] = useState<{
    showcases: MenuOptimizationContentProps['showcases']
    menuItems: MenuOptimizationContentProps['menuItems']
  } | null>(null)
  const [loadingOptimization, setLoadingOptimization] = useState(false)

  useEffect(() => {
    if (value !== 'menu-optimization') return
    if (optimizationData !== null) return
    setLoadingOptimization(true)
    fetch('/api/menu/optimization-data')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load')
        return res.json()
      })
      .then((data) => {
        setOptimizationData({ showcases: data.showcases ?? [], menuItems: data.menuItems ?? [] })
      })
      .catch(() => setOptimizationData({ showcases: [], menuItems: [] }))
      .finally(() => setLoadingOptimization(false))
  }, [value, optimizationData])

  const optimizationProps: MenuOptimizationContentProps = {
    ...rest,
    showcases: optimizationData?.showcases ?? [],
    menuItems: optimizationData?.menuItems ?? [],
  }

  return (
    <Tabs value={value} className="space-y-4">
      <TabsContent value="menu-engineering" className="mt-0">
        {children}
      </TabsContent>
      <TabsContent value="menu-optimization" className="mt-0">
        {loadingOptimization ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <MenuOptimizationContent {...optimizationProps} />
        )}
      </TabsContent>
    </Tabs>
  )
}
