import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - 29)
    startDate.setHours(0, 0, 0, 0)

    const sales = await prisma.sale.findMany({
      where: {
        restaurantId: session.user.restaurantId,
        status: 'COMPLETED',
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { items: true },
    })

    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          restaurantId: session.user.restaurantId,
          status: 'COMPLETED',
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      include: { menuItem: true },
    })

    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0)
    const totalCost = saleItems.reduce(
      (sum, item) => sum + item.cost * item.quantity,
      0
    )
    const totalProfit = totalRevenue - totalCost
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

    const itemMap = new Map<string, { name: string; revenue: number; profit: number }>()
    saleItems.forEach((item) => {
      const lineRevenue = item.price * item.quantity
      const lineProfit = (item.price - item.cost) * item.quantity
      const current = itemMap.get(item.menuItemId) || {
        name: item.menuItem.name,
        revenue: 0,
        profit: 0,
      }
      itemMap.set(item.menuItemId, {
        name: current.name,
        revenue: current.revenue + lineRevenue,
        profit: current.profit + lineProfit,
      })
    })

    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5)

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const prompt = `
You are a financial analyst for a restaurant. Provide 6-8 bullet insights about profitability, menu performance, and cost control.

Metrics for the last 30 days:
- Revenue: ${totalRevenue.toFixed(2)}
- Profit: ${totalProfit.toFixed(2)}
- Margin: ${margin.toFixed(2)}%
- Top items by profit: ${topItems
      .map((item) => `${item.name} (${item.profit.toFixed(2)})`)
      .join(', ')}

Include:
- 2 insights on margin/COGS
- 2 insights on menu mix
- 1 operational insight
- 1 recommended action

Write in plain language, concise, and actionable.`

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    const content =
      response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
        .trim() || 'No insights generated.'

    const insight = await prisma.aIInsight.create({
      data: {
        type: 'MENU_OPTIMIZATION',
        title: 'AI Generated Insights',
        content,
        priority: 'NORMAL',
        restaurantId: session.user.restaurantId,
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    })

    return NextResponse.json({ id: insight.id, content: insight.content })
  } catch (error) {
    console.error('Error generating AI insights:', error)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
