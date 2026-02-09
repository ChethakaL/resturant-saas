'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

type StockRequest = {
  id: string
  status: string
  notes: string | null
  createdAt: string
  restaurant: { id: string; name: string; city: string | null; address: string | null }
  lines: {
    quantity: number
    unit: string
    supplierProduct: { name: string; packSize: number; packUnit: string }
  }[]
}

export default function SupplierStockRequestsPage() {
  const [requests, setRequests] = useState<StockRequest[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/supplier/stock-requests')
      .then((res) => (res.ok ? res.json() : []))
      .then(setRequests)
      .finally(() => setLoading(false))
  }, [])

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/supplier/stock-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Update failed')
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      )
      toast({ title: 'Updated', description: `Request marked as ${status.toLowerCase()}` })
    } catch {
      toast({ title: 'Error', description: 'Could not update request', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Stock requests</h1>
        <p className="text-slate-600 mt-1">
          Restaurants requesting stock from you. Confirm or mark as delivered.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Requests
          </CardTitle>
          <CardDescription>
            {requests.length} request(s) from restaurants using your products
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">
              No stock requests yet. When restaurants use &quot;Request stock&quot; in their inventory, requests appear here.
            </p>
          ) : (
            <div className="space-y-6">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-lg border border-slate-200 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{req.restaurant.name}</p>
                      <p className="text-sm text-slate-500">
                        {req.restaurant.city ?? req.restaurant.address ?? '—'} · {new Date(req.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          req.status === 'DELIVERED'
                            ? 'secondary'
                            : req.status === 'CONFIRMED'
                            ? 'default'
                            : 'outline'
                        }
                      >
                        {req.status}
                      </Badge>
                      {req.status === 'PENDING' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatus(req.id, 'CONFIRMED')}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-slate-500"
                            onClick={() => updateStatus(req.id, 'CANCELLED')}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                      {req.status === 'CONFIRMED' && (
                        <Button
                          size="sm"
                          onClick={() => updateStatus(req.id, 'DELIVERED')}
                        >
                          Mark delivered
                        </Button>
                      )}
                    </div>
                  </div>
                  {req.notes && (
                    <p className="text-sm text-slate-600">{req.notes}</p>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {req.lines.map((line, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            {line.supplierProduct.name} ({line.supplierProduct.packSize} {line.supplierProduct.packUnit})
                          </TableCell>
                          <TableCell className="text-right">
                            {line.quantity} {line.unit}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
