'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, X } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

type RestaurantPoint = {
  restaurantId: string
  restaurantName: string
  city: string | null
  address: string | null
  lat: number | null
  lng: number | null
  menuItemsImpacted: number
  status: string
  lastStockRequestDate: string | null
  stockRequestCount: number
}

const BAGHDAD_CENTER: [number, number] = [33.3152, 44.3661]

export default function SupplierMapClient() {
  const [restaurants, setRestaurants] = useState<RestaurantPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantPoint | null>(null)

  useEffect(() => {
    fetch('/api/supplier/restaurants')
      .then((res) => (res.ok ? res.json() : []))
      .then(setRestaurants)
      .finally(() => setLoading(false))
  }, [])

  const withCoords = restaurants.filter((r) => r.lat != null && r.lng != null)

  const mapCenter: [number, number] =
    withCoords.length > 0
      ? [
          withCoords.reduce((sum, r) => sum + r.lat!, 0) / withCoords.length,
          withCoords.reduce((sum, r) => sum + r.lng!, 0) / withCoords.length,
        ]
      : BAGHDAD_CENTER

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
          Restaurants using your products. Pins require restaurant address with lat/lng.
        </p>
      </div>

      <div className="flex gap-6">
        <div className="flex-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Map
              </CardTitle>
              <CardDescription>
                {withCoords.length} of {restaurants.length} restaurants have coordinates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: '500px' }}>
                <MapContainer
                  center={mapCenter}
                  zoom={withCoords.length === 1 ? 13 : 6}
                  scrollWheelZoom={true}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {withCoords.map((r) => (
                    <Marker
                      key={r.restaurantId}
                      position={[r.lat!, r.lng!]}
                      eventHandlers={{
                        click: () => setSelectedRestaurant(r),
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-semibold">{r.restaurantName}</p>
                          <p className="text-slate-600">
                            {r.menuItemsImpacted} supplier product{r.menuItemsImpacted !== 1 ? 's' : ''} used
                          </p>
                          {r.lastStockRequestDate && (
                            <p className="text-slate-500 text-xs mt-1">
                              Last seen: {new Date(r.lastStockRequestDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
              {restaurants.length > 0 && (
                <div className="mt-4 text-sm text-slate-600">
                  Restaurants without coordinates:{' '}
                  {restaurants
                    .filter((r) => r.lat == null || r.lng == null)
                    .map((r) => r.restaurantName)
                    .join(', ') || 'None'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {selectedRestaurant && (
          <div className="w-80 shrink-0">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{selectedRestaurant.restaurantName}</CardTitle>
                  <button
                    onClick={() => setSelectedRestaurant(null)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {selectedRestaurant.city && (
                  <CardDescription>{selectedRestaurant.city}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedRestaurant.address && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase">Address</p>
                    <p className="text-sm text-slate-700">{selectedRestaurant.address}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase">Products Used</p>
                  <p className="text-sm text-slate-700">
                    {selectedRestaurant.menuItemsImpacted} menu item{selectedRestaurant.menuItemsImpacted !== 1 ? 's' : ''} use your products
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase">Stock Requests</p>
                  <p className="text-sm text-slate-700">
                    {selectedRestaurant.stockRequestCount} request{selectedRestaurant.stockRequestCount !== 1 ? 's' : ''}
                  </p>
                </div>
                {selectedRestaurant.lastStockRequestDate && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase">Last Stock Request</p>
                    <p className="text-sm text-slate-700">
                      {new Date(selectedRestaurant.lastStockRequestDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase">Coordinates</p>
                  <p className="text-sm text-slate-700">
                    {selectedRestaurant.lat?.toFixed(4)}, {selectedRestaurant.lng?.toFixed(4)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
