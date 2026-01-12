import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check last 7 days for P&L activity
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Check for expense transactions, waste records, or sales in the last 7 days
    const [expenseTransactions, wasteRecords, sales] = await Promise.all([
      prisma.expenseTransaction.findFirst({
        where: {
          restaurantId: session.user.restaurantId,
          date: { gte: sevenDaysAgo },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.wasteRecord.findFirst({
        where: {
          restaurantId: session.user.restaurantId,
          date: { gte: sevenDaysAgo },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.sale.findFirst({
        where: {
          restaurantId: session.user.restaurantId,
          status: 'COMPLETED',
          timestamp: { gte: sevenDaysAgo },
        },
        orderBy: { timestamp: 'desc' },
      }),
    ])

    // If there's any activity, no reminder needed
    const hasActivity = expenseTransactions || wasteRecords || sales

    // Find the most recent activity date
    const activityDates = [
      expenseTransactions?.date,
      wasteRecords?.date,
      sales?.timestamp,
    ].filter(Boolean) as Date[]

    const mostRecentActivity = activityDates.length > 0
      ? new Date(Math.max(...activityDates.map((d) => d.getTime())))
      : null

    const daysSinceActivity = mostRecentActivity
      ? Math.floor(
          (new Date().getTime() - mostRecentActivity.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 999

    return NextResponse.json({
      needsReminder: !hasActivity || daysSinceActivity >= 7,
      daysSinceActivity,
      mostRecentActivity: mostRecentActivity?.toISOString() || null,
    })
  } catch (error: any) {
    console.error('Error checking P&L reminder:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check reminder' },
      { status: 500 }
    )
  }
}
