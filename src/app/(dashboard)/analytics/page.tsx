import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import AnalyticsCharts from './AnalyticsCharts'
import { redirect } from 'next/navigation'

const TIME_BUCKETS = ['Morning', 'Afternoon', 'Evening'] as const
type TimeBucket = typeof TIME_BUCKETS[number]

function getTimeBucket(date: Date): TimeBucket {
  const hour = date.getHours()
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

async function getAnalyticsData(restaurantId: string) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 29)
  startDate.setHours(0, 0, 0, 0)
  const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1)

  const sales = await prisma.sale.findMany({
    where: {
      restaurantId,
      status: 'COMPLETED',
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      items: true,
    },
  })

  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        restaurantId,
        status: 'COMPLETED',
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    include: {
      menuItem: {
        include: {
          category: true,
        },
      },
    },
  })

  const trendMap = new Map<string, { revenue: number; cost: number }>()
  sales.forEach((sale) => {
    const dateKey = sale.timestamp.toISOString().slice(0, 10)
    const current = trendMap.get(dateKey) || { revenue: 0, cost: 0 }
    const saleCost = sale.items.reduce(
      (sum, item) => sum + item.cost * item.quantity,
      0
    )
    trendMap.set(dateKey, {
      revenue: current.revenue + sale.total,
      cost: current.cost + saleCost,
    })
  })

  const trendData: { date: string; revenue: number; cost: number }[] = []
  const dateFormatter = new Intl.DateTimeFormat('en-IQ', {
    month: 'short',
    day: 'numeric',
  })
  for (let i = 0; i < 30; i += 1) {
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + i)
    const key = day.toISOString().slice(0, 10)
    const entry = trendMap.get(key) || { revenue: 0, cost: 0 }
    trendData.push({
      date: dateFormatter.format(day),
      revenue: entry.revenue,
      cost: entry.cost,
    })
  }

  const categoryMap = new Map<string, number>()
  const itemMap = new Map<
    string,
    { name: string; revenue: number; profit: number; quantity: number }
  >()

  saleItems.forEach((item) => {
    const categoryName = item.menuItem.category?.name || 'Uncategorized'
    const lineRevenue = item.price * item.quantity
    const lineProfit = (item.price - item.cost) * item.quantity

    categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + lineRevenue)

    const current = itemMap.get(item.menuItemId) || {
      name: item.menuItem.name,
      revenue: 0,
      profit: 0,
      quantity: 0,
    }
    itemMap.set(item.menuItemId, {
      name: current.name,
      revenue: current.revenue + lineRevenue,
      profit: current.profit + lineProfit,
      quantity: current.quantity + item.quantity,
    })
  })

  const categoryData = Array.from(categoryMap.entries())
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)

  const topItemsByRevenue = Array.from(itemMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  const topItemsByProfit = Array.from(itemMap.values())
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10)

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0)
  const totalCost = saleItems.reduce(
    (sum, item) => sum + item.cost * item.quantity,
    0
  )
  const totalProfit = totalRevenue - totalCost
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  const monthlySales = await prisma.sale.findMany({
    where: {
      restaurantId,
      status: 'COMPLETED',
      timestamp: {
        gte: monthStart,
        lte: endDate,
      },
    },
    include: {
      items: true,
    },
  })

  const monthlySaleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        restaurantId,
        status: 'COMPLETED',
        timestamp: {
          gte: monthStart,
          lte: endDate,
        },
      },
    },
    include: {
      menuItem: true,
      sale: true,
    },
  })

  const itemStats = new Map<
    string,
    {
      id: string
      name: string
      quantity: number
      revenue: number
      profit: number
      timeOfDay: Record<TimeBucket, number>
    }
  >()

  monthlySaleItems.forEach((item) => {
    const lineRevenue = item.price * item.quantity
    const lineProfit = (item.price - item.cost) * item.quantity
    const bucket = getTimeBucket(item.sale.timestamp)
    const current = itemStats.get(item.menuItemId) || {
      id: item.menuItemId,
      name: item.menuItem.name,
      quantity: 0,
      revenue: 0,
      profit: 0,
      timeOfDay: {
        Morning: 0,
        Afternoon: 0,
        Evening: 0,
      },
    }

    current.quantity += item.quantity
    current.revenue += lineRevenue
    current.profit += lineProfit
    current.timeOfDay[bucket] += item.quantity
    itemStats.set(item.menuItemId, current)
  })

  const comboMap = new Map<
    string,
    {
      items: [string, string]
      count: number
      revenue: number
      profit: number
      timeOfDay: Record<TimeBucket, number>
    }
  >()
  const topPairByItem = new Map<string, { item: string; count: number }>()

  monthlySales.forEach((sale) => {
    const uniqueItems = Array.from(
      new Set(sale.items.map((item) => item.menuItemId))
    )
    const bucket = getTimeBucket(sale.timestamp)
    const saleRevenue = sale.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )
    const saleProfit = sale.items.reduce(
      (sum, item) => sum + (item.price - item.cost) * item.quantity,
      0
    )

    for (let i = 0; i < uniqueItems.length; i += 1) {
      for (let j = i + 1; j < uniqueItems.length; j += 1) {
        const a = uniqueItems[i]
        const b = uniqueItems[j]
        const key = [a, b].sort().join('|')
        const current = comboMap.get(key) || {
          items: [a, b] as [string, string],
          count: 0,
          revenue: 0,
          profit: 0,
          timeOfDay: {
            Morning: 0,
            Afternoon: 0,
            Evening: 0,
          },
        }

        current.count += 1
        current.revenue += saleRevenue
        current.profit += saleProfit
        current.timeOfDay[bucket] += 1
        comboMap.set(key, current)

        const updateTopPair = (primary: string, secondary: string) => {
          const existing = topPairByItem.get(primary)
          if (!existing || existing.count < current.count) {
            topPairByItem.set(primary, { item: secondary, count: current.count })
          }
        }
        updateTopPair(a, b)
        updateTopPair(b, a)
      }
    }
  })

  const itemStatsArray = Array.from(itemStats.values()).map((item) => {
    const topTimeOfDay = TIME_BUCKETS.reduce((top, bucket) =>
      item.timeOfDay[bucket] > item.timeOfDay[top] ? bucket : top
    )
    return {
      ...item,
      margin: item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0,
      topTimeOfDay,
    }
  })

  const menuItemNameById = new Map(
    monthlySaleItems.map((item) => [item.menuItemId, item.menuItem.name])
  )

  const topSellingItems = [...itemStatsArray]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)
    .map((item) => ({
      ...item,
      commonlyWith: topPairByItem.get(item.id)?.item
        ? menuItemNameById.get(topPairByItem.get(item.id)!.item)
        : undefined,
    }))

  const worstSellingItems = [...itemStatsArray]
    .filter((item) => item.quantity > 0)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 10)

  const highestMarginItems = [...itemStatsArray]
    .filter((item) => item.revenue > 0)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10)
    .map((item) => ({
      ...item,
      commonlyWith: topPairByItem.get(item.id)?.item
        ? menuItemNameById.get(topPairByItem.get(item.id)!.item)
        : undefined,
    }))

  const lowestMarginItems = [...itemStatsArray]
    .filter((item) => item.revenue > 0)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 10)

  const topCombos = Array.from(comboMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((combo) => {
      const topTimeOfDay = TIME_BUCKETS.reduce((top, bucket) =>
        combo.timeOfDay[bucket] > combo.timeOfDay[top] ? bucket : top
      )
      const marginValue = combo.revenue > 0 ? (combo.profit / combo.revenue) * 100 : 0
      return {
        items: combo.items.map((id) => menuItemNameById.get(id) || 'Unknown'),
        count: combo.count,
        margin: marginValue,
        topTimeOfDay,
      }
    })

  return {
    totalRevenue,
    totalCost,
    totalProfit,
    margin,
    trendData,
    categoryData,
    topItemsByRevenue,
    topItemsByProfit,
    topSellingItems,
    worstSellingItems,
    highestMarginItems,
    lowestMarginItems,
    topCombos,
  }
}

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId
  if (session!.user.role === 'STAFF') {
    redirect('/dashboard/orders')
  }

  const data = await getAnalyticsData(restaurantId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-500 mt-1">Sales insights for the last 30 days</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalRevenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">COGS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(data.totalCost)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data.totalProfit)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Gross Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(data.margin)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Items by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Item
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Qty
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItemsByRevenue.map((item) => (
                    <tr key={item.name} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-slate-900 font-medium">{item.name}</td>
                      <td className="py-3 px-4 text-right font-mono">{item.quantity}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatCurrency(item.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.topItemsByRevenue.length === 0 && (
                <p className="text-center py-6 text-slate-500">No sales data yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Items by Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Item
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Profit
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItemsByProfit.map((item) => (
                    <tr key={item.name} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-slate-900 font-medium">{item.name}</td>
                      <td className="py-3 px-4 text-right font-mono text-green-600">
                        {formatCurrency(item.profit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatCurrency(item.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.topItemsByProfit.length === 0 && (
                <p className="text-center py-6 text-slate-500">No sales data yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Items (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Item
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Qty
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Profit
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Margin
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Peak
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topSellingItems.map((item) => (
                    <tr key={item.name} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-slate-900 font-medium">{item.name}</td>
                      <td className="py-3 px-4 text-right font-mono">{item.quantity}</td>
                      <td className="py-3 px-4 text-right font-mono text-green-600">
                        {formatCurrency(item.profit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatPercentage(item.margin)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs">{item.topTimeOfDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.topSellingItems.length === 0 && (
                <p className="text-center py-6 text-slate-500">No monthly sales yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Worst Selling Items (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Item
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Qty
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.worstSellingItems.map((item) => (
                    <tr key={item.name} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-slate-900 font-medium">{item.name}</td>
                      <td className="py-3 px-4 text-right font-mono">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.worstSellingItems.length === 0 && (
                <p className="text-center py-6 text-slate-500">No monthly sales yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Highest Margin Items (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Item
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Margin
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Qty
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Peak
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Commonly With
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.highestMarginItems.map((item) => (
                    <tr key={item.name} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-slate-900 font-medium">{item.name}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatPercentage(item.margin)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">{item.quantity}</td>
                      <td className="py-3 px-4 text-right text-xs">{item.topTimeOfDay}</td>
                      <td className="py-3 px-4 text-right text-xs text-slate-500">
                        {item.commonlyWith || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.highestMarginItems.length === 0 && (
                <p className="text-center py-6 text-slate-500">No monthly sales yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lowest Margin Items (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Item
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Margin
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Qty
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowestMarginItems.map((item) => (
                    <tr key={item.name} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-slate-900 font-medium">{item.name}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatPercentage(item.margin)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.lowestMarginItems.length === 0 && (
                <p className="text-center py-6 text-slate-500">No monthly sales yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commonly Purchased Together</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Items
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Orders
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Margin
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Peak
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topCombos.map((combo, idx) => (
                  <tr key={`${combo.items.join('-')}-${idx}`} className="border-b border-slate-100">
                    <td className="py-3 px-4 text-slate-900 font-medium">
                      {combo.items.join(' + ')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{combo.count}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatPercentage(combo.margin)}
                    </td>
                    <td className="py-3 px-4 text-right text-xs">{combo.topTimeOfDay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.topCombos.length === 0 && (
              <p className="text-center py-6 text-slate-500">No combo data yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue & Cost Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <AnalyticsCharts trendData={data.trendData} categoryData={data.categoryData} />
        </CardContent>
      </Card>
    </div>
  )
}
