import { Card, CardContent, CardHeader } from '@/components/ui/card'

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-200 rounded ${className || ''}`} />
  )
}

export default function NewOrderLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-40 mb-2" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Menu Items Section */}
        <div className="lg:col-span-2 space-y-4">
          {/* Category Tabs */}
          <div className="flex gap-2 flex-wrap">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-24" />
            ))}
          </div>

          {/* Menu Items Grid */}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {[...Array(12)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-24 w-full rounded-md mb-3" />
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Order Summary Section */}
        <div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Table Selection */}
              <div>
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>

              {/* Customer Name */}
              <div>
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>

              {/* Order Items */}
              <div className="space-y-3 pt-4 border-t">
                <Skeleton className="h-5 w-24" />
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div>
                      <Skeleton className="h-4 w-28 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="pt-4 border-t">
                <div className="flex justify-between">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>

              {/* Submit Button */}
              <Skeleton className="h-12 w-full mt-4" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
