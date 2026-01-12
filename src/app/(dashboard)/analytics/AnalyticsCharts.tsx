'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts'

export default function AnalyticsCharts({
  trendData,
  categoryData,
}: {
  trendData: { date: string; revenue: number; cost: number }[]
  categoryData: { name: string; revenue: number }[]
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData} margin={{ left: 48, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis width={72} tickMargin={10} allowDecimals={false} domain={[0, 'auto']} />
            <Tooltip />
            <Line type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={2} />
            <Line type="monotone" dataKey="cost" stroke="#f97316" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categoryData} margin={{ left: 48, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis width={72} tickMargin={10} allowDecimals={false} domain={[0, 'auto']} />
            <Tooltip />
            <Bar dataKey="revenue" fill="#16a34a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
