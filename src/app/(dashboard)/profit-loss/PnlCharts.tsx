'use client'

import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useFormatCurrency } from '@/lib/i18n'

interface ChartPoint {
  date: string
  revenue: number
  expenses: number
  net: number
}

export default function PnlCharts({ data }: { data: ChartPoint[] }) {
  const formatCurrencyWithRestaurant = useFormatCurrency()
  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" stroke="#64748b" />
          <YAxis stroke="#64748b" tickFormatter={(value) => formatCurrencyWithRestaurant(value)} />
          <Tooltip
            formatter={(value: number) => formatCurrencyWithRestaurant(value)}
            labelClassName="text-slate-600"
          />
          <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} />
          <Line type="monotone" dataKey="expenses" stroke="#f97316" strokeWidth={2} />
          <Line type="monotone" dataKey="net" stroke="#2563eb" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
