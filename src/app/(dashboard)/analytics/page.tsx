import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import AnalyticsCharts from './AnalyticsCharts'

async function getAnalyticsData(restaurantId: string) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 29)
  startDate.setHours(0, 0, 0, 0)

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

  return {
    totalRevenue,
    totalCost,
    totalProfit,
    margin,
    trendData,
    categoryData,
    topItemsByRevenue,
    topItemsByProfit,
  }
}

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions)
  const restaurantId = session!.user.restaurantId

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

      <Card>
        <CardHeader>
          <CardTitle>Revenue & Cost Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <AnalyticsCharts trendData={data.trendData} categoryData={data.categoryData} />
        </CardContent>
      </Card>

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
    </div>
  )
}
