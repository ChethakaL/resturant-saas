'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, MapPin } from 'lucide-react'

const AddressMapPicker = dynamic(
  () => import('@/components/settings/AddressMapPicker'),
  { ssr: false }
)

type SearchResult = {
  id: string
  place_name: string
  center: [number, number]
}

interface GoogleMapsStreetPickerProps {
  value: string
  onChange: (value: string) => void
  onPlaceSelected?: (details: { address: string; lat: number | null; lng: number | null }) => void
  city?: string
  lat?: number | null
  lng?: number | null
  disabled?: boolean
  placeholder?: string
}

const IRAQ_CENTER: [number, number] = [33.2232, 43.6793]

async function reverseGeocode(token: string, lat: number, lng: number) {
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=iq&language=en&access_token=${encodeURIComponent(token)}`
  )
  if (!response.ok) {
    throw new Error('Reverse geocoding failed')
  }
  const data = await response.json()
  return data?.features?.[0]?.place_name as string | undefined
}

export function GoogleMapsStreetPicker({
  value,
  onChange,
  onPlaceSelected,
  city,
  lat = null,
  lng = null,
  disabled = false,
  placeholder = 'Search street or address',
}: GoogleMapsStreetPickerProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(
    lat != null && lng != null ? [lat, lng] : null
  )
  const [mounted, setMounted] = useState(false)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (lat != null && lng != null) {
      setSelectedCoords([lat, lng])
      return
    }
    setSelectedCoords(null)
  }, [lat, lng])

  const cityQuery = useMemo(() => {
    const trimmed = (city || '').trim()
    return trimmed ? `${trimmed}, Iraq` : 'Iraq'
  }, [city])

  useEffect(() => {
    if (!token || disabled) {
      setResults([])
      return
    }

    const trimmed = query.trim()
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }

    if (trimmed.length < 3) {
      setResults([])
      return
    }

    debounceRef.current = window.setTimeout(async () => {
      try {
        setSearching(true)
        const searchText = city ? `${trimmed}, ${cityQuery}` : `${trimmed}, Iraq`
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchText)}.json?country=iq&language=en&limit=5&types=address,place,poi,locality,neighborhood&access_token=${encodeURIComponent(token)}`
        )
        if (!response.ok) {
          throw new Error('Mapbox lookup failed')
        }
        const data = await response.json()
        const nextResults = Array.isArray(data?.features)
          ? data.features.map((feature: any) => ({
              id: feature.id,
              place_name: feature.place_name,
              center: feature.center as [number, number],
            }))
          : []
        setResults(nextResults)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [city, cityQuery, disabled, query, token])

  const selectResult = (result: SearchResult) => {
    setQuery(result.place_name)
    onChange(result.place_name)
    setResults([])
    const nextCoords: [number, number] = [result.center[1], result.center[0]]
    setSelectedCoords(nextCoords)
    onPlaceSelected?.({
      address: result.place_name,
      lat: result.center[1],
      lng: result.center[0],
    })
  }

  const handleManualPick = async (lat: number, lng: number) => {
    setSelectedCoords([lat, lng])
    if (!token) {
      onPlaceSelected?.({ address: query, lat, lng })
      return
    }

    try {
      const address = await reverseGeocode(token, lat, lng)
      const nextValue = address || query
      if (nextValue) {
        setQuery(nextValue)
        onChange(nextValue)
      }
      onPlaceSelected?.({ address: nextValue, lat, lng })
    } catch {
      onPlaceSelected?.({ address: query, lat, lng })
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            onChange(event.target.value)
          }}
          disabled={disabled}
          placeholder={placeholder}
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        ) : null}
      </div>

      {results.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => selectResult(result)}
              className="flex w-full items-start gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="text-sm text-slate-700">{result.place_name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!token ? (
        <p className="text-xs text-amber-600">
          Mapbox is not configured. Add `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` to enable address search and map picking.
        </p>
      ) : null}

      {mounted && token ? (
        <div className="space-y-2">
          <div className="h-64 overflow-hidden rounded-lg border border-slate-200">
            <AddressMapPicker
              token={token}
              center={selectedCoords || IRAQ_CENTER}
              selectedCoords={selectedCoords}
              onPick={handleManualPick}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Search for an address, or click the map / drag the pin to choose the exact location manually.
            </p>
            {selectedCoords ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedCoords(null)
                  onPlaceSelected?.({ address: query, lat: null, lng: null })
                }}
              >
                Clear pin
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
