import { Card, CardContent, CardHeader } from '@/components/ui/card'

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-200 rounded ${className || ''}`} />
  )
}

export default function InventoryLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-56 mb-2" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24 mb-1" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ingredients Table */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  {['Ingredient', 'Stock', 'Unit', 'Cost/Unit', 'Total Value', 'Status', 'Actions'].map((_, i) => (
                    <th key={i} className="py-3 px-4">
                      <Skeleton className="h-3 w-16" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...Array(15)].map((_, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-100">
                    <td className="py-3 px-4">
                      <Skeleton className="h-5 w-28 mb-1" />
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-5 w-16 ml-auto" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-5 w-10" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-5 w-16 ml-auto" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-5 w-20 ml-auto" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-6 w-16 mx-auto rounded-full" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-8 w-14 ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
