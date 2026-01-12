import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts } from 'pdf-lib'

export const dynamic = 'force-dynamic'

function daysBetweenInclusive(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1
}

function monthsBetweenInclusive(start: Date, end: Date) {
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1
  )
}

function overlapRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  const effectiveStart = start > rangeStart ? start : rangeStart
  const effectiveEnd = end < rangeEnd ? end : rangeEnd
  if (effectiveEnd < effectiveStart) return null
  return { start: effectiveStart, end: effectiveEnd }
}

function expenseTotalForPeriod(
  expense: {
    amount: number
    cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL'
    startDate: Date
    endDate: Date | null
  },
  rangeStart: Date,
  rangeEnd: Date
) {
  const end = expense.endDate || rangeEnd
  const range = overlapRange(expense.startDate, end, rangeStart, rangeEnd)
  if (!range) return 0

  const dayCount = daysBetweenInclusive(range.start, range.end)
  const monthCount = monthsBetweenInclusive(range.start, range.end)

  switch (expense.cadence) {
    case 'DAILY':
      return expense.amount * dayCount
    case 'WEEKLY':
      return expense.amount * (dayCount / 7)
    case 'MONTHLY':
      return expense.amount * monthCount
    case 'ANNUAL':
      return expense.amount * (monthCount / 12)
    default:
      return 0
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')

    const now = new Date()
    const rangeStart = startParam ? new Date(startParam) : new Date(now.getFullYear(), now.getMonth(), 1)
    const rangeEnd = endParam ? new Date(endParam) : now

    const sales = await prisma.sale.findMany({
      where: {
        restaurantId: session.user.restaurantId,
        status: 'COMPLETED',
        timestamp: { gte: rangeStart, lte: rangeEnd },
      },
      include: {
        items: true,
      },
    })

    const expenses = await prisma.expense.findMany({
      where: {
        restaurantId: session.user.restaurantId,
      },
    })

    const payrolls = await prisma.payroll.findMany({
      where: {
        restaurantId: session.user.restaurantId,
        status: 'PAID',
        OR: [
          {
            paidDate: {
              gte: rangeStart,
              lte: rangeEnd,
            },
          },
          {
            period: {
              gte: rangeStart,
              lte: rangeEnd,
            },
          },
        ],
      },
    })

    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0)
    const totalCOGS = sales.reduce(
      (sum, sale) =>
        sum + sale.items.reduce((sub, item) => sub + item.cost * item.quantity, 0),
      0
    )
    const grossProfit = totalRevenue - totalCOGS
    const payrollTotal = payrolls.reduce((sum, payroll) => sum + payroll.totalPaid, 0)

    const expenseTotals = expenses.map((expense) => ({
      ...expense,
      total: expenseTotalForPeriod(expense, rangeStart, rangeEnd),
    }))

    const expenseByCategory = expenseTotals.reduce<Record<string, number>>((acc, exp) => {
      const key = exp.category || 'General'
      acc[key] = (acc[key] || 0) + exp.total
      return acc
    }, {})

    const totalExpenses = Object.values(expenseByCategory).reduce(
      (sum, value) => sum + value,
      0
    )

    const netProfit = grossProfit - totalExpenses - payrollTotal

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792])
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    let y = 740
    const drawLine = (label: string, value: number) => {
      page.drawText(label, { x: 50, y, size: 12, font: fontBold })
      page.drawText(value.toFixed(2), { x: 350, y, size: 12, font })
      y -= 18
    }

    page.drawText('Profit & Loss Statement', { x: 50, y, size: 18, font: fontBold })
    y -= 24
    page.drawText(
      `Period: ${rangeStart.toDateString()} - ${rangeEnd.toDateString()}`,
      { x: 50, y, size: 11, font }
    )
    y -= 26

    drawLine('Revenue', totalRevenue)
    drawLine('COGS', totalCOGS)
    drawLine('Gross Profit', grossProfit)
    drawLine('Operating Expenses', totalExpenses)
    drawLine('Payroll', payrollTotal)
    drawLine('Net Profit', netProfit)

    y -= 18
    page.drawText('Expenses by Category', { x: 50, y, size: 13, font: fontBold })
    y -= 18
    Object.entries(expenseByCategory).forEach(([category, total]) => {
      page.drawText(category, { x: 60, y, size: 11, font })
      page.drawText(total.toFixed(2), { x: 350, y, size: 11, font })
      y -= 16
    })

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="profit-loss.pdf"',
      },
    })
  } catch (error) {
    console.error('Error generating P&L PDF:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
