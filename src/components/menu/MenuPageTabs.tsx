'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UtensilsCrossed, Zap } from 'lucide-react'
import MenuOptimizationContent, { type MenuOptimizationContentProps } from './MenuOptimizationContent'

interface MenuPageTabsProps extends MenuOptimizationContentProps {
  children: React.ReactNode
}

export default function MenuPageTabs({ children, ...optimizationProps }: MenuPageTabsProps) {
  return (
    <Tabs defaultValue="menu-engineering" className="space-y-4">
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
