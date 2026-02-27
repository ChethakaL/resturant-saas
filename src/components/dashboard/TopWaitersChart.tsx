'use client'

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
import { useFormatCurrency } from '@/lib/i18n'

interface WaiterData {
  name: string
  sales: number
  orders: number
  avgOrder: number
}

interface TopWaitersChartProps {
  waiters: WaiterData[]
}

export default function TopWaitersChart({ waiters }: TopWaitersChartProps) {
  const formatCurrencyWithRestaurant = useFormatCurrency()
  const chartData = waiters.map((waiter) => ({
    name: waiter.name,
    sales: waiter.sales,
    orders: waiter.orders,
    avgOrder: waiter.avgOrder,
  }))

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 100, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={80}
            stroke="#64748b"
            fontSize={12}
          />
          <YAxis
            stroke="#64748b"
            tickFormatter={(value) => formatCurrencyWithRestaurant(value)}
            width={90}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === 'sales') {
                return [formatCurrencyWithRestaurant(value), 'Total Sales']
              }
              if (name === 'orders') {
                return [value, 'Orders']
              }
              if (name === 'avgOrder') {
                return [formatCurrencyWithRestaurant(value), 'Avg Order']
              }
              return [value, name]
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
            dataKey="sales"
            name="Total Sales"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
