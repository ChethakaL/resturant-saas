'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import { formatCurrency, formatPercentage } from '@/lib/utils'

interface DailyData {
  date: string
  revenue: number
  margin: number
  netProfit: number
}

export default function DailyRevenueMarginChart() {
  const [data, setData] = useState<DailyData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        // Get Year-to-Date data (Jan 1st to today)
        const today = new Date()
        const startOfYear = new Date(today.getFullYear(), 0, 1)
        
        // Format dates for API
        const startDateStr = startOfYear.toISOString().split('T')[0]
        const endDateStr = today.toISOString().split('T')[0]
        
        const response = await fetch(`/api/reports/daily-revenue-margin?startDate=${startDateStr}&endDate=${endDateStr}`)
        if (!response.ok) throw new Error('Failed to fetch data')
        const result = await response.json()
        setData(result)
      } catch (error) {
        console.error('Error fetching chart data:', error)
      } finally {
        setLoading(false)
      }
    }

    const handleImportSaved = () => {
      void fetchData()
    }

    void fetchData()
    window.addEventListener('monthly-sales-import-saved', handleImportSaved)

    return () => {
      window.removeEventListener('monthly-sales-import-saved', handleImportSaved)
    }
  }, [])

  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="text-slate-500">Loading chart data...</div>
      </div>
    )
  }

  // Aggregate daily data into monthly buckets for the current year
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()

  // Initialize monthly map
  const monthlyDataMap = new Map<number, { revenue: number; netProfit: number }>()
  for (let m = 0; m <= currentMonth; m++) {
    monthlyDataMap.set(m, { revenue: 0, netProfit: 0 })
  }

  // Populate map with data
  data.forEach((item) => {
    const date = new Date(item.date)
    if (date.getFullYear() === currentYear) {
      const month = date.getMonth()
      const current = monthlyDataMap.get(month)
      if (current) {
        current.revenue += item.revenue
        current.netProfit += item.netProfit
      }
    }
  })

  // Build chart data for all months up to current month
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const chartData = []
  for (let m = 0; m <= currentMonth; m++) {
    const stats = monthlyDataMap.get(m)!
    const marginAmount = stats.netProfit
    const avgMarginPercent = stats.revenue > 0 ? (stats.netProfit / stats.revenue) * 100 : 0

    chartData.push({
      date: monthNames[m],
      dateLabel: `${monthNames[m]} ${currentYear}`,
      Revenue: stats.revenue,
      Margin: marginAmount,
      marginPercent: avgMarginPercent,
    })
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart 
          data={chartData} 
          margin={{ top: 20, right: 30, left: 100, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            stroke="#64748b"
            fontSize={12}
            tick={{ fill: '#64748b' }}
          />
          <YAxis
            stroke="#64748b"
            tickFormatter={(value) => {
              const formatted = formatCurrency(value)
              return formatted.replace('IQD', '').trim()
            }}
            width={90}
            tick={{ fill: '#64748b' }}
          />
          <Tooltip
            formatter={(value: number, name: string, payload: any) => {
              if (name === 'Margin') {
                // Show both amount and percentage in tooltip
                const marginPercent = payload?.payload?.marginPercent || 0
                return [
                  `${formatCurrency(value)} (${formatPercentage(marginPercent, 1)})`,
                  'Margin'
                ]
              }
              if (name === 'Revenue') {
                return [formatCurrency(value), 'Revenue']
              }
              return [formatCurrency(value), name]
            }}
            labelFormatter={(label, payload) => {
              if (payload && payload[0]) {
                return payload[0].payload.dateLabel
              }
              return label
            }}
            labelStyle={{ color: '#1e293b' }}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
            }}
          />
          <Legend />
          <Bar
            dataKey="Revenue"
            name="Revenue"
            fill="#1e293b"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="Margin"
            name="Margin"
            fill="#94a3b8"
            radius={[0, 0, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
