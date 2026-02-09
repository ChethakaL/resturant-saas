'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Store, ChevronDown, ChevronRight, Package } from 'lucide-react'
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
  lastStockRequestDate: string | null
  stockRequestCount: number
}

type UsageProduct = {
  supplierProductId: string
  productName: string
  menuItems: { menuItemId: string; menuItemName: string }[]
}

export default function SupplierRestaurantsPage() {
  const [list, setList] = useState<RestaurantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [usageData, setUsageData] = useState<Record<string, UsageProduct[]>>({})
  const [usageLoading, setUsageLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/supplier/restaurants')
      .then((res) => (res.ok ? res.json() : []))
      .then(setList)
      .finally(() => setLoading(false))
  }, [])

  const toggleExpand = useCallback(
    (restaurantId: string) => {
      if (expandedId === restaurantId) {
        setExpandedId(null)
        return
      }

      setExpandedId(restaurantId)

      // Fetch usage data if we haven't already
      if (!usageData[restaurantId]) {
        setUsageLoading((prev) => ({ ...prev, [restaurantId]: true }))
        fetch(`/api/supplier/restaurants/${restaurantId}/usage`)
          .then((res) => (res.ok ? res.json() : { products: [] }))
          .then((data) => {
            setUsageData((prev) => ({ ...prev, [restaurantId]: data.products }))
          })
          .finally(() => {
            setUsageLoading((prev) => ({ ...prev, [restaurantId]: false }))
          })
      }
    },
    [expandedId, usageData]
  )

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '--'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
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
            Usage is based on recipe ingredient lines and stock requests.
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
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>City / Area</TableHead>
                  <TableHead>Menu items impacted</TableHead>
                  <TableHead>Stock requests</TableHead>
                  <TableHead>Last order</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => {
                  const isExpanded = expandedId === r.restaurantId
                  const products = usageData[r.restaurantId]
                  const isLoadingUsage = usageLoading[r.restaurantId]

                  return (
                    <>
                      <TableRow
                        key={r.restaurantId}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => toggleExpand(r.restaurantId)}
                      >
                        <TableCell className="w-10 pr-0">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{r.restaurantName}</TableCell>
                        <TableCell>{r.city ?? r.address ?? '--'}</TableCell>
                        <TableCell>{r.menuItemsImpacted}</TableCell>
                        <TableCell>
                          <Badge variant={r.stockRequestCount > 0 ? 'default' : 'secondary'}>
                            {r.stockRequestCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {formatDate(r.lastStockRequestDate)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={r.status === 'active' ? 'default' : 'secondary'}
                            className="capitalize"
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`${r.restaurantId}-detail`}>
                          <TableCell colSpan={7} className="bg-slate-50 p-0">
                            <div className="px-6 py-4">
                              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Your products used by {r.restaurantName}
                              </h4>

                              {isLoadingUsage ? (
                                <p className="text-sm text-slate-500 py-2">Loading product usage...</p>
                              ) : !products || products.length === 0 ? (
                                <p className="text-sm text-slate-500 py-2">
                                  No product usage data found for this restaurant.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {products.map((p) => (
                                    <div
                                      key={p.supplierProductId}
                                      className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-slate-800">
                                            {p.productName}
                                          </span>
                                          <Badge variant="secondary" className="text-xs">
                                            {p.menuItems.length} menu item{p.menuItems.length !== 1 ? 's' : ''}
                                          </Badge>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {p.menuItems.map((mi) => (
                                            <span
                                              key={mi.menuItemId}
                                              className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                                            >
                                              {mi.menuItemName}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
