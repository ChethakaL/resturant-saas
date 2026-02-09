'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Store } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type RestaurantRow = {
  restaurantId: string
  restaurantName: string
  city: string | null
  address: string | null
  menuItemsImpacted: number
  status: string
}

export default function SupplierRestaurantsPage() {
  const [list, setList] = useState<RestaurantRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/supplier/restaurants')
      .then((res) => res.ok ? res.json() : [])
      .then(setList)
      .finally(() => setLoading(false))
  }, [])

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
        <h1 className="text-2xl font-bold text-slate-900">Restaurants using your products</h1>
        <p className="text-slate-600 mt-1">
          Restaurants that have selected your products in at least one recipe
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Restaurants
          </CardTitle>
          <CardDescription>
            Usage is based on recipe ingredient lines; order-based metrics will appear when ordering is enabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">
              No restaurants are using your products yet. When restaurants add your products to their recipe lines, they will appear here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>City / Area</TableHead>
                  <TableHead>Menu items impacted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.restaurantId}>
                    <TableCell className="font-medium">{r.restaurantName}</TableCell>
                    <TableCell>{r.city ?? r.address ?? '—'}</TableCell>
                    <TableCell>{r.menuItemsImpacted}</TableCell>
                    <TableCell className="capitalize">{r.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
