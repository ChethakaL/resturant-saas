'use client'

import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useFormatCurrency } from '@/lib/i18n'

interface WeeklyPoint {
  date: string
  revenue: number
  orders: number
}

export default function WeeklySalesChart({ data }: { data: WeeklyPoint[] }) {
  const formatCurrencyWithRestaurant = useFormatCurrency()
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={8}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" stroke="#64748b" />
          <YAxis stroke="#64748b" />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === 'revenue' ? formatCurrencyWithRestaurant(value) : value
            }
            labelClassName="text-slate-600"
          />
          <Bar dataKey="revenue" fill="#22c55e" radius={[6, 6, 0, 0]} />
          <Bar dataKey="orders" fill="#2563eb" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
