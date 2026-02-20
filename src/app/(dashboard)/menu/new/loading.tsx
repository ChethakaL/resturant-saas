export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-9 w-20 rounded-md bg-slate-200" />
        <div>
          <div className="h-8 w-48 rounded bg-slate-200" />
          <div className="h-4 w-64 rounded bg-slate-100 mt-2" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-1 border-b border-slate-200 pb-0">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 w-28 rounded-t bg-slate-200" />
        ))}
      </div>

      {/* Main card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="h-10 w-full rounded-md bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-24 w-full rounded-md bg-slate-100" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="h-10 w-full rounded-md bg-slate-100" />
        </div>
      </div>

      {/* Smart Chef card skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="h-6 w-40 rounded bg-slate-200" />
        <div className="h-64 rounded-lg bg-slate-100" />
      </div>
    </div>
  )
}
