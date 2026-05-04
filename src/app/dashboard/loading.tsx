export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        <p className="text-sm text-slate-600">Loading dashboard data...</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
        <div className="h-56 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
      </div>

      <div className="h-80 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
    </div>
  )
}
