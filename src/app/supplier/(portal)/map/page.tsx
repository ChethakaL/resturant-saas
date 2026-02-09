'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin } from 'lucide-react'

type RestaurantPoint = {
  restaurantId: string
  restaurantName: string
  city: string | null
  address: string | null
  lat: number | null
  lng: number | null
  menuItemsImpacted: number
}

export default function SupplierMapPage() {
  const [restaurants, setRestaurants] = useState<RestaurantPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/supplier/restaurants')
      .then((res) => res.ok ? res.json() : [])
      .then(setRestaurants)
      .finally(() => setLoading(false))
  }, [])

  const withCoords = restaurants.filter((r) => r.lat != null && r.lng != null)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-slate-500">Loading map data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Map of restaurants</h1>
        <p className="text-slate-600 mt-1">
          Restaurants using your products. Pins require restaurant address with lat/lng (e.g. geocoded on save).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Map
          </CardTitle>
          <CardDescription>
            {withCoords.length} of {restaurants.length} restaurants have coordinates. Integrate Google Maps or Mapbox to show pins here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 bg-slate-50 h-[400px] flex items-center justify-center text-slate-500">
            Map placeholder — add Google Maps or Mapbox with pins for:
            <ul className="list-disc list-inside mt-2 text-left">
              {withCoords.slice(0, 5).map((r) => (
                <li key={r.restaurantId}>{r.restaurantName} ({r.menuItemsImpacted} items)</li>
              ))}
              {withCoords.length > 5 && <li>… and {withCoords.length - 5} more</li>}
            </ul>
          </div>
          {restaurants.length > 0 && (
            <div className="mt-4 text-sm text-slate-600">
              Restaurants without coordinates: {restaurants.filter((r) => r.lat == null || r.lng == null).map((r) => r.restaurantName).join(', ') || 'None'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
