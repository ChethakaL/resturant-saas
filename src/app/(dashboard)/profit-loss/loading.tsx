import { Card, CardContent, CardHeader } from '@/components/ui/card'

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-200 rounded ${className || ''}`} />
  )
}

export default function ProfitLossLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-56 mb-2" />
          <Skeleton className="h-5 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* P&L Table */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Revenue Section */}
            <div>
              <Skeleton className="h-5 w-24 mb-3" />
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-slate-100">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>

            {/* COGS Section */}
            <div>
              <Skeleton className="h-5 w-36 mb-3" />
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-slate-100">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>

            {/* Expenses Section */}
            <div>
              <Skeleton className="h-5 w-40 mb-3" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-slate-100">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>

            {/* Net Profit */}
            <div className="pt-4 border-t-2 border-slate-300">
              <div className="flex justify-between">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-6 w-32" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
