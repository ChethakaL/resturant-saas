'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import {
  Plus,
  Trash2,
  Download,
  Edit,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Wallet,
  AlertTriangle,
  Building2,
} from 'lucide-react'
import AddExpenseModal from './AddExpenseModal'
import AddWasteModal from './AddWasteModal'
import { useI18n, useDynamicTranslate, useFormatCurrency } from '@/lib/i18n'
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
    cogsCoveragePercent?: number
    revenueWithCosting?: number
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

/** Helper: format a date as YYYY-MM-DD */
function toDateString(d: Date) {
  return d.toISOString().split('T')[0]
}

/** Quick-period date ranges */
function getQuickPeriod(period: 'today' | 'week' | 'month') {
  const now = new Date()
  switch (period) {
    case 'today':
      return { start: toDateString(now), end: toDateString(now) }
    case 'week': {
      const day = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - ((day + 6) % 7))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      return { start: toDateString(monday), end: toDateString(sunday) }
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { start: toDateString(start), end: toDateString(end) }
    }
  }
}

export default function ProfitLossPageClient() {
  const { toast } = useToast()
  const { t } = useI18n()
  const { t: td } = useDynamicTranslate()
  const formatCurrencyWithRestaurant = useFormatCurrency()
  const [activePeriod, setActivePeriod] = useState<string>('month')
  const [dateRange, setDateRange] = useState(() => getQuickPeriod('month'))
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
  // Branch filtering (per-branch only; no "all branches" option)
  const [branches, setBranches] = useState<{ id: string; name: string; address?: string | null }[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('')

  const fetchData = async () => {
    setLoading(true)
    try {
      let url = `/api/reports/pnl/data?start=${dateRange.start}&end=${dateRange.end}`
      const branchId = selectedBranch || (branches.length > 0 ? branches[0].id : null)
      if (branchId) {
        url += `&branchId=${branchId}`
      }
      const response = await fetch(url)
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

  // Fetch branches on mount; default to first branch (per-branch only, no "all")
  useEffect(() => {
    fetch('/api/branches')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBranches(data)
          setSelectedBranch((prev) => (prev === '' && data.length > 0 ? data[0].id : prev))
        }
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end, selectedBranch])

  const handleQuickPeriod = (period: 'today' | 'week' | 'month') => {
    setActivePeriod(period)
    setDateRange(getQuickPeriod(period))
  }

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

  // ── Loss Forecasting ──
  const forecast = useMemo(() => {
    if (!data) return null

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const daysInMonth = monthEnd.getDate()
    const daysElapsed = Math.max(now.getDate(), 1)

    // Only show forecast when viewing this month
    const rangeStart = new Date(dateRange.start)
    const rangeEnd = new Date(dateRange.end)
    const isCurrentMonth =
      rangeStart.getFullYear() === monthStart.getFullYear() &&
      rangeStart.getMonth() === monthStart.getMonth() &&
      rangeEnd.getFullYear() === monthEnd.getFullYear() &&
      rangeEnd.getMonth() === monthEnd.getMonth()

    if (!isCurrentMonth) return null

    const projectedRevenue =
      (data.summary.revenue / daysElapsed) * daysInMonth
    const projectedCogs = (data.summary.cogs / daysElapsed) * daysInMonth
    const projectedExpenses =
      (data.summary.expenses / daysElapsed) * daysInMonth
    const projectedPayroll =
      (data.summary.payroll / daysElapsed) * daysInMonth
    const projectedGrossProfit = projectedRevenue - projectedCogs
    const projectedNetProfit =
      projectedGrossProfit - projectedExpenses - projectedPayroll

    // Top cost drivers
    const drivers: Array<{ label: string; amount: number }> = []
    if (projectedCogs > 0)
      drivers.push({ label: 'COGS', amount: projectedCogs })
    if (projectedPayroll > 0)
      drivers.push({ label: 'Labor', amount: projectedPayroll })
    if (projectedExpenses > 0)
      drivers.push({ label: 'Operating Expenses', amount: projectedExpenses })
    drivers.sort((a, b) => b.amount - a.amount)

    return {
      projectedRevenue,
      projectedNetProfit,
      daysElapsed,
      daysInMonth,
      isLoss: projectedNetProfit < 0,
      drivers: drivers.slice(0, 3),
    }
  }, [data, dateRange])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">{td('Loading...')}</div>
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
          <h1 className="text-3xl font-bold text-slate-900">{t.sales_title}</h1>
          <p className="text-slate-500 mt-1">{td('Period')}: {dateRangeLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {branches.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              <select
                value={selectedBranch || (branches.length > 0 ? branches[0].id : '')}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.address ? `(${b.address})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => {
              const branchId = selectedBranch || (branches.length > 0 ? branches[0].id : null)
              let url = `/api/reports/pnl?start=${dateRange.start}&end=${dateRange.end}`
              if (branchId) url += `&branchId=${branchId}`
              window.open(url, '_blank')
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            {td('Download PDF')}
          </Button>
        </div>
      </div>

      {/* ── COGS incomplete warning ── */}
      {data.summary.revenue > 0 &&
        typeof data.summary.cogsCoveragePercent === 'number' &&
        data.summary.cogsCoveragePercent < 100 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-800">{td('COGS is incomplete')}</h3>
                <p className="text-sm text-amber-700 mt-1">
                  {td('Only')} {data.summary.cogsCoveragePercent}% {td('of sales are covered by items with complete costing. Add recipe costs to menu items for accurate COGS and gross profit.')}
                </p>
              </div>
            </div>
          </div>
        )}

      {/* ── Loss Forecasting Alert ── */}
      {forecast?.isLoss && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-800">
                {td('Projected net loss this month')}: {formatCurrencyWithRestaurant(Math.abs(forecast.projectedNetProfit))}
              </h3>
              <p className="text-sm text-red-700 mt-1">
                {td('Based on')} {forecast.daysElapsed} {td('of')} {forecast.daysInMonth} {td('days elapsed, projected revenue is')} {formatCurrencyWithRestaurant(forecast.projectedRevenue)}.
              </p>
              {forecast.drivers.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-red-700 uppercase tracking-wide">
                    {td('Top cost drivers')}:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {forecast.drivers.map((d) => (
                      <li
                        key={d.label}
                        className="text-sm text-red-700 flex items-center justify-between max-w-xs"
                      >
                        <span>{td(d.label)}</span>
                        <span className="font-mono">
                          {formatCurrencyWithRestaurant(d.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Date range — one card, no overlap */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-6">
            {/* Presets: horizontal segmented control */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
              {[
                { key: 'today', label: td('Today') },
                { key: 'week', label: td('This week') },
                { key: 'month', label: td('This month') },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleQuickPeriod(key)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors min-w-[88px] ${activePeriod === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Custom range: From / To with clear spacing */}
            <div className="flex flex-wrap items-end gap-6">
              <div className="flex items-end gap-2">
                <Label htmlFor="pnl-start-date" className="text-sm text-slate-600 whitespace-nowrap pb-2.5">{td('From')}</Label>
                <div className="w-[160px]">
                  <DatePicker
                    value={dateRange.start}
                    onChange={(value) => {
                      setActivePeriod('custom')
                      setDateRange({ ...dateRange, start: value })
                    }}
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <Label htmlFor="pnl-end-date" className="text-sm text-slate-600 whitespace-nowrap pb-2.5">{td('To')}</Label>
                <div className="w-[160px]">
                  <DatePicker
                    value={dateRange.end}
                    onChange={(value) => {
                      setActivePeriod('custom')
                      setDateRange({ ...dateRange, end: value })
                    }}
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant={activePeriod === 'custom' ? 'default' : 'outline'}
                onClick={() => {
                  setActivePeriod('custom')
                  fetchData()
                }}
                className="shrink-0 mb-0.5"
              >
                {td('Apply')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Card Tiles ── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-lg bg-green-100 p-2 flex-shrink-0">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
                  {td('Revenue')}
                </p>
                <p className="text-base sm:text-lg xl:text-xl font-bold text-green-600 font-mono break-all">
                  {formatCurrencyWithRestaurant(data.summary.revenue)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-lg bg-amber-100 p-2 flex-shrink-0">
                <ShoppingCart className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
                  {td('COGS')}
                </p>
                <p className="text-base sm:text-lg xl:text-xl font-bold text-amber-600 font-mono break-all">
                  {formatCurrencyWithRestaurant(data.summary.cogs)}
                </p>
                {typeof data.summary.cogsCoveragePercent === 'number' && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {td('Coverage')}: {data.summary.cogsCoveragePercent}%
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-lg bg-emerald-100 p-2 flex-shrink-0">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
                  {td('Gross Profit')}
                </p>
                <p className="text-base sm:text-lg xl:text-xl font-bold text-emerald-600 font-mono break-all">
                  {formatCurrencyWithRestaurant(data.summary.grossProfit)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-lg bg-red-100 p-2 flex-shrink-0">
                <Wallet className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
                  {td('Expenses')}
                </p>
                <p className="text-base sm:text-lg xl:text-xl font-bold text-red-600 font-mono break-all">
                  {formatCurrencyWithRestaurant(data.summary.expenses + data.summary.payroll)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`rounded-lg p-2 flex-shrink-0 ${data.summary.netProfit >= 0
                  ? 'bg-green-100'
                  : 'bg-red-100'
                  }`}
              >
                {data.summary.netProfit >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
                  {td('Net Profit')}
                </p>
                <p
                  className={`text-base sm:text-lg xl:text-xl font-bold font-mono break-all ${data.summary.netProfit >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                    }`}
                >
                  {formatCurrencyWithRestaurant(data.summary.netProfit)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`rounded-lg p-2 flex-shrink-0 ${profitMargin >= 0 ? 'bg-blue-100' : 'bg-red-100'
                  }`}
              >
                {profitMargin >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
                  {td('Profit Margin')}
                </p>
                <p
                  className={`text-base sm:text-lg xl:text-xl font-bold font-mono break-all ${profitMargin >= 0 ? 'text-blue-600' : 'text-red-600'
                    }`}
                >
                  {profitMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Summary Table */}
      <Card>
        <CardHeader className="bg-slate-800 text-white">
          <CardTitle className="text-white">{td('PROFIT AND LOSS SUMMARY')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-4 font-semibold">{td('Item')}</th>
                <th className="text-right p-4 font-semibold">{td('Amount')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-4 font-semibold">{td('SALES')}</td>
                <td className="p-4 text-right font-mono text-green-600">
                  {formatCurrencyWithRestaurant(data.summary.revenue)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-4 font-semibold">{td('COGS (Cost of Goods Sold)')}</td>
                <td className="p-4 text-right font-mono text-amber-600">
                  {formatCurrencyWithRestaurant(data.summary.cogs)}
                </td>
              </tr>
              <tr className="border-b bg-slate-50">
                <td className="p-4 font-semibold">{td('GROSS PROFIT')}</td>
                <td className="p-4 text-right font-mono font-bold text-green-600">
                  {formatCurrencyWithRestaurant(data.summary.grossProfit)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-4 font-semibold">{td('LABOR EXPENSE')}</td>
                <td className="p-4 text-right font-mono text-red-600">
                  {formatCurrencyWithRestaurant(data.summary.payroll)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-4 font-semibold">{td('OTHER EXPENSE')}</td>
                <td className="p-4 text-right font-mono text-red-600">
                  {formatCurrencyWithRestaurant(data.summary.expenses)}
                </td>
              </tr>
              <tr className="bg-slate-50">
                <td className="p-4 font-bold text-lg">{td('NET INCOME')}</td>
                <td className={`p-4 text-right font-mono font-bold text-lg ${data.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                  {formatCurrencyWithRestaurant(data.summary.netProfit)}
                </td>
              </tr>
              <tr>
                <td className="p-4 font-semibold">{td('PROFIT MARGIN')}</td>
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
            <CardTitle className="text-white">{td('SALES')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">{td('Category')}</th>
                  <th className="text-right p-3 text-sm font-semibold">{td('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(salesByCategory).map(([category, stats]) => (
                  <tr key={category} className="border-b">
                    <td className="p-3">{category}</td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrencyWithRestaurant(stats.revenue)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="p-3">{td('TOTAL SALES')}</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrencyWithRestaurant(data.summary.revenue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-blue-600 text-white">
            <CardTitle className="text-white">{td('COST OF GOODS SOLD')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">{td('Category')}</th>
                  <th className="text-right p-3 text-sm font-semibold">{td('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(salesByCategory).map(([category, stats]) => (
                  <tr key={category} className="border-b">
                    <td className="p-3">{category}</td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrencyWithRestaurant(stats.cogs)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="p-3">{td('TOTAL COGS')}</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrencyWithRestaurant(data.summary.cogs)}
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
            <CardTitle className="text-white">{td('LABOR EXPENSE')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">{td('Item')}</th>
                  <th className="text-right p-3 text-sm font-semibold">{td('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-3">{td('Salaries and Wages')}</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrencyWithRestaurant(data.summary.payroll * 0.7)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">{td('Payroll Taxes')}</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrencyWithRestaurant(data.summary.payroll * 0.15)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">{td('Employee Benefits')}</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrencyWithRestaurant(data.summary.payroll * 0.15)}
                  </td>
                </tr>
                <tr className="bg-slate-50 font-semibold">
                  <td className="p-3">{td('TOTAL LABOR EXPENSE')}</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrencyWithRestaurant(data.summary.payroll)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-blue-600 text-white">
            <CardTitle className="text-white">{td('OTHER EXPENSE')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">{td('Category')}</th>
                  <th className="text-right p-3 text-sm font-semibold">{td('Amount')}</th>
                  <th className="text-center p-3 text-sm font-semibold">{td('Actions')}</th>
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
                        <td className="p-3">{td(category)}</td>
                        <td className="p-3 text-right font-mono">
                          {formatCurrencyWithRestaurant(total)}
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
                    <td className="p-3 font-semibold text-red-700">{td('Waste / Losses and Damages')}</td>
                    <td className="p-3 text-right font-mono text-red-700">
                      {formatCurrencyWithRestaurant(
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
                  <td className="p-3">{td('TOTAL OTHER EXPENSE')}</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrencyWithRestaurant(data.summary.expenses)}
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
          {td('Add Expense')}
        </Button>
        <Button variant="outline" onClick={() => setShowWasteModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {td('Record Waste')}
        </Button>
      </div>

      {/* Detailed Transaction Records - Spreadsheet Style */}
      <Card>
        <CardHeader className="bg-slate-800 text-white">
          <CardTitle className="text-white">{td('DETAILED TRANSACTION RECORDS')}</CardTitle>
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
                  {type === 'ALL' ? td('All') : type}
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
                {td('All Categories')}
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
                      {td('Type')}
                      <span className="text-xs text-slate-400">{sortIndicator('type')}</span>
                    </button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('description')}
                      className="flex items-center gap-2"
                    >
                      {td('Description')}
                      <span className="text-xs text-slate-400">{sortIndicator('description')}</span>
                    </button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('category')}
                      className="flex items-center gap-2"
                    >
                      {td('Category')}
                      <span className="text-xs text-slate-400">{sortIndicator('category')}</span>
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('amount')}
                      className="ml-auto flex items-center gap-2"
                    >
                      {td('Amount')}
                      <span className="text-xs text-slate-400">{sortIndicator('amount')}</span>
                    </button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('details')}
                      className="flex items-center gap-2"
                    >
                      {td('Details')}
                      <span className="text-xs text-slate-400">{sortIndicator('details')}</span>
                    </button>
                  </th>
                  <th className="text-center p-3 font-semibold">{td('Actions')}</th>
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
                        className={`px-2 py-1 rounded text-xs ${row.type === 'REVENUE'
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
                      className={`p-3 text-right font-mono ${row.amount >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                    >
                      {row.amount >= 0
                        ? formatCurrencyWithRestaurant(row.amount)
                        : `-${formatCurrencyWithRestaurant(Math.abs(row.amount))}`}
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
