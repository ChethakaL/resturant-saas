'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface AddressMapPickerProps {
  token: string
  center: [number, number]
  selectedCoords: [number, number] | null
  onPick: (lat: number, lng: number) => void
}

export default function AddressMapPicker({
  token,
  center,
  selectedCoords,
  onPick,
}: AddressMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    const map = L.map(containerRef.current, {
      center,
      zoom: selectedCoords ? 15 : 6,
      scrollWheelZoom: true,
    })

    L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${token}`,
      {
        attribution: '&copy; OpenStreetMap contributors &copy; Mapbox',
        tileSize: 512,
        zoomOffset: -1,
      }
    ).addTo(map)

    map.on('click', (event: L.LeafletMouseEvent) => {
      onPick(event.latlng.lat, event.latlng.lng)
    })

    mapRef.current = map

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [center, onPick, selectedCoords, token])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    const nextCenter = selectedCoords || center
    const nextZoom = selectedCoords ? Math.max(map.getZoom(), 15) : 6
    map.setView(nextCenter, nextZoom, { animate: true })

    if (!selectedCoords) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    if (!markerRef.current) {
      markerRef.current = L.marker(selectedCoords, { draggable: true })
        .addTo(map)
        .on('dragend', (event) => {
          const marker = event.target as L.Marker
          const latlng = marker.getLatLng()
          onPick(latlng.lat, latlng.lng)
        })
      return
    }

    markerRef.current.setLatLng(selectedCoords)
  }, [center, onPick, selectedCoords])

  return <div ref={containerRef} className="h-full w-full" />
}
