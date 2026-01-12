'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Trash2, Download, Edit } from 'lucide-react'
import AddExpenseModal from './AddExpenseModal'
import AddWasteModal from './AddWasteModal'
import DatePicker from '@/components/ui/date-picker'

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

function recurringTotalForRange(
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

interface PnLData {
  summary: {
    revenue: number
    cogs: number
    cogsFromSales: number
    cogsFromMealPrep: number
    cogsFromManualAdjustments: number
    grossProfit: number
    expenses: number
    payroll: number
    netProfit: number
  }
  expenseByCategory: Record<string, number>
  expenseTransactions: any[]
  expenses: any[]
  wasteRecords: any[]
  mealPrepSessions: any[]
  sales: any[]
  payrolls: any[]
}

type TransactionRow = {
  id: string
  date: Date
  type: 'REVENUE' | 'COGS' | 'EXPENSE' | 'WASTE' | 'LABOR'
  description: string
  category: string
  amount: number
  details: string
  deleteType?: 'expense' | 'waste'
  editKind?: 'recurring' | 'transaction'
  editPayload?: any
}

export default function ProfitLossPageClient() {
  const { toast } = useToast()
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    }
  })
  const [data, setData] = useState<PnLData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showWasteModal, setShowWasteModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<any | null>(null)
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('ALL')
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState('ALL')
  const [sortConfig, setSortConfig] = useState<{
    key: keyof TransactionRow
    direction: 'asc' | 'desc'
  }>({ key: 'date', direction: 'desc' })

  const fetchData = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/reports/pnl/data?start=${dateRange.start}&end=${dateRange.end}`
      )
      if (!response.ok) throw new Error('Failed to fetch data')
      const result = await response.json()
      setData(result)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load P&L data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end])

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return

    try {
      const response = await fetch(`/api/expenses/transactions/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete')
      toast({
        title: 'Success',
        description: 'Expense deleted successfully',
      })
      fetchData()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete expense',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteWaste = async (id: string) => {
    if (!confirm('Are you sure you want to delete this waste record?')) return

    try {
      const response = await fetch(`/api/waste/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete')
      toast({
        title: 'Success',
        description: 'Waste record deleted successfully',
      })
      fetchData()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete waste record',
        variant: 'destructive',
      })
    }
  }

  const handleEditExpense = (transaction: any | null) => {
    if (!transaction) {
      toast({
        title: 'No expense found',
        description: 'There are no expense transactions to edit for this category.',
        variant: 'destructive',
      })
      return
    }
    setEditingExpense(transaction)
    setShowExpenseModal(true)
  }

  const handleDeleteRecurring = async (id: string) => {
    if (!confirm('End this recurring expense today?')) return

    try {
      const response = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete expense')
      toast({
        title: 'Success',
        description: 'Recurring expense ended successfully',
      })
      fetchData()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete expense',
        variant: 'destructive',
      })
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading...</div>
      </div>
    )
  }

  const expenseRangeStart = new Date(dateRange.start)
  const expenseRangeEnd = new Date(dateRange.end)

  const transactions: TransactionRow[] = [
    ...data.sales.map((sale) => ({
      id: sale.id,
      date: new Date(sale.timestamp),
      type: 'REVENUE' as const,
      description: `Sale: ${sale.orderNumber}`,
      category: 'Revenue',
      amount: sale.total,
      details: `${sale.items.length} items`,
    })),
    ...data.sales.map((sale) => ({
      id: `${sale.id}-cogs`,
      date: new Date(sale.timestamp),
      type: 'COGS' as const,
      description: `COGS: ${sale.orderNumber}`,
      category: 'COGS',
      amount: -sale.items.reduce(
        (sum: number, item: any) => sum + item.cost * item.quantity,
        0
      ),
      details: 'Ingredients used',
    })),
    ...data.expenseTransactions.map((tx) => ({
      id: tx.id,
      date: new Date(tx.date),
      type: 'EXPENSE' as const,
      description: tx.name,
      category: tx.category,
      amount: -tx.amount,
      details: tx.ingredient
        ? `${tx.quantity} ${tx.ingredient.unit} of ${tx.ingredient.name}`
        : tx.notes || '-',
      deleteType: 'expense' as const,
      editKind: 'transaction' as const,
      editPayload: tx,
    })),
    ...data.expenses
      .map((exp) => {
        const totalForRange = recurringTotalForRange(
          {
            amount: exp.amount,
            cadence: exp.cadence,
            startDate: new Date(exp.startDate),
            endDate: exp.endDate ? new Date(exp.endDate) : null,
          },
          expenseRangeStart,
          expenseRangeEnd
        )
        return {
          id: exp.id,
          date: new Date(exp.startDate),
          type: 'EXPENSE' as const,
          description: `Recurring: ${exp.name}`,
          category: exp.category || 'Other',
          amount: -totalForRange,
          details: `Cadence: ${exp.cadence}`,
          editKind: 'recurring' as const,
          editPayload: exp,
        }
      })
      .filter((row) => row.amount !== 0),
    ...data.wasteRecords.map((waste) => ({
      id: waste.id,
      date: new Date(waste.date),
      type: 'WASTE' as const,
      description: `Waste: ${waste.ingredient.name}`,
      category: 'Waste / Losses',
      amount: -waste.cost,
      details: `${waste.quantity} ${waste.ingredient.unit} - ${waste.reason || 'No reason'}`,
      deleteType: 'waste' as const,
    })),
    ...data.mealPrepSessions.map((session) => ({
      id: `${session.id}-prep`,
      date: new Date(session.prepDate),
      type: 'COGS' as const,
      description: `Meal Prep: ${session.sessionTime}`,
      category: 'Meal Prep',
      amount: -session.totalCost,
      details: `Prepared by ${session.preparedBy || 'Kitchen'}`,
    })),
    ...data.payrolls.map((payroll) => ({
      id: payroll.id,
      date: new Date(payroll.paidDate || payroll.period),
      type: 'LABOR' as const,
      description: `Payroll: ${payroll.employee?.name || 'Employee'}`,
      category: 'Labor',
      amount: -payroll.totalPaid,
      details: payroll.notes || `Period: ${new Date(payroll.period).toLocaleDateString()}`,
    })),
  ]

  const sortedTransactions = [...transactions].sort((a, b) => {
    const direction = sortConfig.direction === 'asc' ? 1 : -1
    const valueA = a[sortConfig.key]
    const valueB = b[sortConfig.key]

    if (valueA instanceof Date && valueB instanceof Date) {
      return (valueA.getTime() - valueB.getTime()) * direction
    }

    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return (valueA - valueB) * direction
    }

    return String(valueA).localeCompare(String(valueB)) * direction
  })

  const filteredTransactions = sortedTransactions.filter((row) => {
    if (transactionTypeFilter !== 'ALL' && row.type !== transactionTypeFilter) {
      return false
    }
    if (
      transactionCategoryFilter !== 'ALL' &&
      row.category !== transactionCategoryFilter
    ) {
      return false
    }
    return true
  })

  const transactionCategories = Array.from(
    new Set(transactions.map((row) => row.category).filter(Boolean))
  ).sort()

  const toggleSort = (key: keyof TransactionRow) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        }
      }
      return {
        key,
        direction: key === 'date' ? 'desc' : 'asc',
      }
    })
  }

  const sortIndicator = (key: keyof TransactionRow) => {
    if (sortConfig.key !== key) return ''
    return sortConfig.direction === 'asc' ? '▲' : '▼'
  }

  // Calculate profit margin
  const profitMargin = data.summary.revenue > 0
    ? (data.summary.netProfit / data.summary.revenue) * 100
    : 0

  // Group sales by category (for detailed breakdown)
  const salesByCategory = data.sales.reduce((acc: Record<string, { revenue: number; cogs: number; count: number }>, sale) => {
    sale.items.forEach((item: any) => {
      const category = item.menuItem?.category?.name || 'Other'
      if (!acc[category]) {
        acc[category] = { revenue: 0, cogs: 0, count: 0 }
      }
      acc[category].revenue += item.price * item.quantity
      acc[category].cogs += item.cost * item.quantity
      acc[category].count += item.quantity
    })
    return acc
  }, {})

  // Format date range label
  const dateRangeLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateRange.start)) + ' to ' + new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateRange.end))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">RESTAURANT PROFIT AND LOSS</h1>
          <p className="text-slate-500 mt-1">Period: {dateRangeLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              window.open(
                `/api/reports/pnl?start=${dateRange.start}&end=${dateRange.end}`,
                '_blank'
              )
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Date Range Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="start-date">From</Label>
              <DatePicker
                value={dateRange.start}
                onChange={(value) =>
                  setDateRange({ ...dateRange, start: value })
                }
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="end-date">To</Label>
              <DatePicker
                value={dateRange.end}
                onChange={(value) =>
                  setDateRange({ ...dateRange, end: value })
                }
              />
            </div>
            <Button onClick={fetchData}>Apply</Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Table - Top Section */}
      <Card>
        <CardHeader className="bg-slate-800 text-white">
          <CardTitle className="text-white">PROFIT AND LOSS SUMMARY</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-4 font-semibold">Item</th>
                <th className="text-right p-4 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-4 font-semibold">SALES</td>
                <td className="p-4 text-right font-mono text-green-600">
                  {formatCurrency(data.summary.revenue)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-4 font-semibold">COGS (Cost of Goods Sold)</td>
                <td className="p-4 text-right font-mono text-amber-600">
                  {formatCurrency(data.summary.cogs)}
                </td>
              </tr>
              <tr className="border-b bg-slate-50">
                <td className="p-4 font-semibold">GROSS PROFIT</td>
                <td className="p-4 text-right font-mono font-bold text-green-600">
                  {formatCurrency(data.summary.grossProfit)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-4 font-semibold">LABOR EXPENSE</td>
                <td className="p-4 text-right font-mono text-red-600">
                  {formatCurrency(data.summary.payroll)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-4 font-semibold">OTHER EXPENSE</td>
                <td className="p-4 text-right font-mono text-red-600">
                  {formatCurrency(data.summary.expenses)}
                </td>
              </tr>
              <tr className="bg-slate-50">
                <td className="p-4 font-bold text-lg">NET INCOME</td>
                <td className={`p-4 text-right font-mono font-bold text-lg ${
                  data.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatCurrency(data.summary.netProfit)}
                </td>
              </tr>
              <tr>
                <td className="p-4 font-semibold">PROFIT MARGIN</td>
                <td className="p-4 text-right font-mono">
                  {profitMargin.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Detailed Breakdown - Sales and COGS */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="bg-blue-600 text-white">
            <CardTitle className="text-white">SALES</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Category</th>
                  <th className="text-right p-3 text-sm font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(salesByCategory).map(([category, stats]) => (
                  <tr key={category} className="border-b">
                    <td className="p-3">{category}</td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(stats.revenue)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="p-3">TOTAL SALES</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrency(data.summary.revenue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-blue-600 text-white">
            <CardTitle className="text-white">COST OF GOODS SOLD</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Category</th>
                  <th className="text-right p-3 text-sm font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(salesByCategory).map(([category, stats]) => (
                  <tr key={category} className="border-b">
                    <td className="p-3">{category}</td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(stats.cogs)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="p-3">TOTAL COGS</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrency(data.summary.cogs)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown - Labor and Other Expenses */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="bg-blue-600 text-white">
            <CardTitle className="text-white">LABOR EXPENSE</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Item</th>
                  <th className="text-right p-3 text-sm font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-3">Salaries and Wages</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrency(data.summary.payroll * 0.7)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">Payroll Taxes</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrency(data.summary.payroll * 0.15)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">Employee Benefits</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrency(data.summary.payroll * 0.15)}
                  </td>
                </tr>
                <tr className="bg-slate-50 font-semibold">
                  <td className="p-3">TOTAL LABOR EXPENSE</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrency(data.summary.payroll)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-blue-600 text-white">
            <CardTitle className="text-white">OTHER EXPENSE</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Category</th>
                  <th className="text-right p-3 text-sm font-semibold">Amount</th>
                  <th className="text-center p-3 text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.expenseByCategory)
                  .filter(([cat]) => cat !== 'Waste') // Waste shown separately
                  .map(([category, total]) => {
                    const latestTransaction = data.expenseTransactions
                      .filter((tx) => tx.category === category)
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                    return (
                    <tr key={category} className="border-b">
                      <td className="p-3">{category}</td>
                      <td className="p-3 text-right font-mono">
                        {formatCurrency(total)}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleEditExpense(
                              latestTransaction
                                ? { ...latestTransaction, kind: 'transaction' }
                                : null
                            )
                          }
                          disabled={!latestTransaction}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                    )
                  })}
                {/* Waste section - automatically shown */}
                {data.wasteRecords.length > 0 && (
                  <tr className="border-b bg-red-50">
                    <td className="p-3 font-semibold text-red-700">Waste / Losses and Damages</td>
                    <td className="p-3 text-right font-mono text-red-700">
                      {formatCurrency(
                        data.wasteRecords.reduce((sum, w) => sum + w.cost, 0)
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowWasteModal(true)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )}
                <tr className="bg-slate-50 font-semibold">
                  <td className="p-3">TOTAL OTHER EXPENSE</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrency(data.summary.expenses)}
                  </td>
                  <td className="p-3"></td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button onClick={() => {
          setEditingExpense(null)
          setShowExpenseModal(true)
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Expense
        </Button>
        <Button variant="outline" onClick={() => setShowWasteModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Record Waste
        </Button>
      </div>

      {/* Detailed Transaction Records - Spreadsheet Style */}
      <Card>
        <CardHeader className="bg-slate-800 text-white">
          <CardTitle className="text-white">DETAILED TRANSACTION RECORDS</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {[
                'ALL',
                'REVENUE',
                'COGS',
                'EXPENSE',
                'WASTE',
                'LABOR',
              ].map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant={transactionTypeFilter === type ? 'default' : 'outline'}
                  className="rounded-full"
                  onClick={() => setTransactionTypeFilter(type)}
                >
                  {type === 'ALL' ? 'All' : type}
                </Button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={transactionCategoryFilter === 'ALL' ? 'default' : 'outline'}
                className="rounded-full"
                onClick={() => setTransactionCategoryFilter('ALL')}
              >
                All Categories
              </Button>
              {transactionCategories.map((category) => (
                <Button
                  key={category}
                  size="sm"
                  variant={
                    transactionCategoryFilter === category ? 'default' : 'outline'
                  }
                  className="rounded-full"
                  onClick={() => setTransactionCategoryFilter(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('date')}
                      className="flex items-center gap-2"
                    >
                      Date
                      <span className="text-xs text-slate-400">{sortIndicator('date')}</span>
                    </button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('type')}
                      className="flex items-center gap-2"
                    >
                      Type
                      <span className="text-xs text-slate-400">{sortIndicator('type')}</span>
                    </button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('description')}
                      className="flex items-center gap-2"
                    >
                      Description
                      <span className="text-xs text-slate-400">{sortIndicator('description')}</span>
                    </button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('category')}
                      className="flex items-center gap-2"
                    >
                      Category
                      <span className="text-xs text-slate-400">{sortIndicator('category')}</span>
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('amount')}
                      className="ml-auto flex items-center gap-2"
                    >
                      Amount
                      <span className="text-xs text-slate-400">{sortIndicator('amount')}</span>
                    </button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('details')}
                      className="flex items-center gap-2"
                    >
                      Details
                      <span className="text-xs text-slate-400">{sortIndicator('details')}</span>
                    </button>
                  </th>
                  <th className="text-center p-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((row) => (
                  <tr key={`${row.type}-${row.id}`} className="border-b hover:bg-slate-50">
                    <td className="p-3">
                      {row.date.toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          row.type === 'REVENUE'
                            ? 'bg-green-100 text-green-800'
                            : row.type === 'COGS'
                            ? 'bg-amber-100 text-amber-800'
                            : row.type === 'EXPENSE'
                            ? 'bg-red-100 text-red-800'
                            : row.type === 'WASTE'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="p-3">{row.description}</td>
                    <td className="p-3">{row.category}</td>
                    <td
                      className={`p-3 text-right font-mono ${
                        row.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {row.amount >= 0
                        ? formatCurrency(row.amount)
                        : `-${formatCurrency(Math.abs(row.amount))}`}
                    </td>
                    <td className="p-3 text-slate-500">{row.details}</td>
                    <td className="p-3 text-center">
                      {row.editKind && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleEditExpense({
                              ...(row.editPayload || {}),
                              kind: row.editKind,
                            })
                          }
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {row.deleteType === 'expense' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteExpense(row.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                      {row.deleteType === 'waste' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteWaste(row.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                      {!row.deleteType && !row.editKind && (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      No transactions found for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <AddExpenseModal
        open={showExpenseModal}
        initialData={editingExpense}
        onClose={() => {
          setShowExpenseModal(false)
          setEditingExpense(null)
        }}
        onSaved={() => fetchData()}
      />
      <AddWasteModal
        open={showWasteModal}
        onClose={() => {
          setShowWasteModal(false)
          fetchData()
        }}
      />
    </div>
  )
}
