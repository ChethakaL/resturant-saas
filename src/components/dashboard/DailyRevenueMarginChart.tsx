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
import { formatPercentage } from '@/lib/utils'
import { useFormatCurrency } from '@/lib/i18n'

interface DailyData {
  date: string
  revenue: number
  margin: number
  netProfit: number
}

export default function DailyRevenueMarginChart() {
  const formatCurrencyWithRestaurant = useFormatCurrency()
  const [data, setData] = useState<DailyData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current month data (from day 1 to today)
        const today = new Date()
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0) // Last day of month
        
        // Format dates for API
        const startDateStr = startOfMonth.toISOString().split('T')[0]
        const endDateStr = today.toISOString().split('T')[0]
        
        const response = await fetch(`/api/reports/daily-revenue-margin?startDate=${startDateStr}&endDate=${endDateStr}`)
        if (!response.ok) throw new Error('Failed to fetch data')
        const result = await response.json()
        setData(result)
      } catch (error) {
        console.error('Error fetching daily data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="text-slate-500">Loading chart data...</div>
      </div>
    )
  }

  // Create data for all days of current month (1-31), filling missing days with zeros
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const todayDay = today.getDate()

  // Create a map of existing data by day
  const dataByDay = new Map<number, DailyData>()
  data.forEach((item) => {
    const date = new Date(item.date)
    if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
      dataByDay.set(date.getDate(), item)
    }
  })

  // Build chart data for all days of the month
  const chartData = []
  for (let day = 1; day <= daysInMonth; day++) {
    const existingData = dataByDay.get(day)
    const date = new Date(currentYear, currentMonth, day)
    
    if (existingData) {
      // Use actual data
      const marginAmount = (existingData.revenue * existingData.margin) / 100
      chartData.push({
        date: day.toString(),
        dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Revenue: existingData.revenue,
        Margin: marginAmount,
        marginPercent: existingData.margin,
      })
    } else {
      // Fill with zeros for days without data
      chartData.push({
        date: day.toString(),
        dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Revenue: 0,
        Margin: 0,
        marginPercent: 0,
      })
    }
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
            tickFormatter={(value) => formatCurrencyWithRestaurant(value)}
            width={90}
            tick={{ fill: '#64748b' }}
          />
          <Tooltip
            formatter={(value: number, name: string, payload: any) => {
              if (name === 'Margin') {
                // Show both amount and percentage in tooltip
                const marginPercent = payload?.marginPercent || 0
                return [
                  `${formatCurrencyWithRestaurant(value)} (${formatPercentage(marginPercent, 1)})`,
                  'Margin'
                ]
              }
              if (name === 'Revenue') {
                return [formatCurrencyWithRestaurant(value), 'Revenue']
              }
              return [formatCurrencyWithRestaurant(value), name]
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
