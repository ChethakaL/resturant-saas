'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { Award, TrendingDown, TrendingUp, ShoppingCart } from 'lucide-react'

interface MenuItemStat {
  id: string
  name: string
  quantity: number
  revenue: number
  profit: number
  margin: number
  topTimeOfDay: string
  commonlyWith?: string
}

interface ComboStat {
  items: [string, string]
  count: number
  margin: number
  topTimeOfDay: string
}

interface MenuItemAnalyticsProps {
  topSellingItems: MenuItemStat[]
  worstSellingItems: MenuItemStat[]
  highestMarginItems: MenuItemStat[]
  lowestMarginItems: MenuItemStat[]
  topCombos: ComboStat[]
}

export default function MenuItemAnalytics({
  topSellingItems,
  worstSellingItems,
  highestMarginItems,
  lowestMarginItems,
  topCombos,
}: MenuItemAnalyticsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Top Selling Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-500" />
            Top Selling Items (This Month)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">ITEM</th>
                  <th className="text-right p-2 font-semibold">QTY</th>
                  <th className="text-right p-2 font-semibold">PROFIT</th>
                  <th className="text-right p-2 font-semibold">MARGIN</th>
                  <th className="text-center p-2 font-semibold">PEAK</th>
                </tr>
              </thead>
              <tbody>
                {topSellingItems.slice(0, 10).map((item, idx) => (
                  <tr key={item.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right font-mono text-green-600">
                      {formatCurrency(item.profit)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {formatPercentage(item.margin, 1)}
                    </td>
                    <td className="p-2 text-center text-xs text-slate-500">
                      {item.topTimeOfDay}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Worst Selling Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            Worst Selling Items (This Month)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">ITEM</th>
                  <th className="text-right p-2 font-semibold">QTY</th>
                  <th className="text-right p-2 font-semibold">REVENUE</th>
                  <th className="text-right p-2 font-semibold">MARGIN</th>
                </tr>
              </thead>
              <tbody>
                {worstSellingItems.slice(0, 10).map((item) => (
                  <tr key={item.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right font-mono">
                      {formatCurrency(item.revenue)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {formatPercentage(item.margin, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Highest Margin Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Highest Margin Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">ITEM</th>
                  <th className="text-right p-2 font-semibold">QTY</th>
                  <th className="text-right p-2 font-semibold">MARGIN</th>
                  <th className="text-center p-2 font-semibold">PEAK</th>
                  <th className="text-left p-2 font-semibold">WITH</th>
                </tr>
              </thead>
              <tbody>
                {highestMarginItems.slice(0, 10).map((item) => (
                  <tr key={item.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right font-mono text-green-600">
                      {formatPercentage(item.margin, 1)}
                    </td>
                    <td className="p-2 text-center text-xs text-slate-500">
                      {item.topTimeOfDay}
                    </td>
                    <td className="p-2 text-xs text-slate-500">
                      {item.commonlyWith || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Lowest Margin Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            Lowest Margin Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">ITEM</th>
                  <th className="text-right p-2 font-semibold">QTY</th>
                  <th className="text-right p-2 font-semibold">MARGIN</th>
                  <th className="text-right p-2 font-semibold">REVENUE</th>
                </tr>
              </thead>
              <tbody>
                {lowestMarginItems.slice(0, 10).map((item) => (
                  <tr key={item.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right font-mono text-red-600">
                      {formatPercentage(item.margin, 1)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {formatCurrency(item.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Items Commonly Purchased Together */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-blue-500" />
            Items Commonly Purchased Together
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">ITEM COMBINATION</th>
                  <th className="text-right p-2 font-semibold">COUNT</th>
                  <th className="text-right p-2 font-semibold">TOTAL MARGIN</th>
                  <th className="text-center p-2 font-semibold">PEAK TIME</th>
                </tr>
              </thead>
              <tbody>
                {topCombos.slice(0, 10).map((combo, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50">
                    <td className="p-2 font-medium">
                      {combo.items[0]} + {combo.items[1]}
                    </td>
                    <td className="p-2 text-right">{combo.count}</td>
                    <td className="p-2 text-right font-mono text-green-600">
                      {formatPercentage(combo.margin, 1)}
                    </td>
                    <td className="p-2 text-center text-xs text-slate-500">
                      {combo.topTimeOfDay}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
