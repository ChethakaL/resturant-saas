'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPercentage } from '@/lib/utils'
import { Award, TrendingDown, TrendingUp, ShoppingCart } from 'lucide-react'
import { useI18n, useFormatCurrency } from '@/lib/i18n'

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

const TIME_BUCKET_KEYS = { Morning: 'dashboard_time_morning', Afternoon: 'dashboard_time_afternoon', Evening: 'dashboard_time_evening' } as const

export default function MenuItemAnalytics({
  topSellingItems,
  worstSellingItems,
  highestMarginItems,
  lowestMarginItems,
  topCombos,
}: MenuItemAnalyticsProps) {
  const { t } = useI18n()
  const formatCurrencyWithRestaurant = useFormatCurrency()

  const translateTimeBucket = (bucket: string) => {
    const key = TIME_BUCKET_KEYS[bucket as keyof typeof TIME_BUCKET_KEYS]
    return key ? t[key] : bucket
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Top Selling Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-500" />
            {t.dashboard_top_selling}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">{t.dashboard_col_item}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_qty}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_profit}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_margin}</th>
                  <th className="text-center p-2 font-semibold">{t.dashboard_col_peak}</th>
                </tr>
              </thead>
              <tbody>
                {topSellingItems.slice(0, 10).map((item, idx) => (
                  <tr key={item.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right font-mono text-green-600">
                      {formatCurrencyWithRestaurant(item.profit)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {formatPercentage(item.margin, 1)}
                    </td>
                    <td className="p-2 text-center text-xs text-slate-500">
                      {translateTimeBucket(item.topTimeOfDay)}
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
            {t.dashboard_worst_selling}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">{t.dashboard_col_item}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_qty}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_revenue}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_margin}</th>
                </tr>
              </thead>
              <tbody>
                {worstSellingItems.slice(0, 10).map((item) => (
                  <tr key={item.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right font-mono">
                      {formatCurrencyWithRestaurant(item.revenue)}
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
            {t.dashboard_highest_margin}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">{t.dashboard_col_item}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_qty}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_margin}</th>
                  <th className="text-center p-2 font-semibold">{t.dashboard_col_peak}</th>
                  <th className="text-left p-2 font-semibold">{t.dashboard_col_with}</th>
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
                      {translateTimeBucket(item.topTimeOfDay)}
                    </td>
                    <td className="p-2 text-xs text-slate-500">
                      {item.commonlyWith || '—'}
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
            {t.dashboard_lowest_margin}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">{t.dashboard_col_item}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_qty}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_margin}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_revenue}</th>
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
                      {formatCurrencyWithRestaurant(item.revenue)}
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
            {t.dashboard_commonly_together}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">{t.dashboard_col_item_combination}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_count}</th>
                  <th className="text-right p-2 font-semibold">{t.dashboard_col_total_margin}</th>
                  <th className="text-center p-2 font-semibold">{t.dashboard_col_peak_time}</th>
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
                      {translateTimeBucket(combo.topTimeOfDay)}
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
