'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [20, 20] })
    }
  }, [coords, map])
  return null
}

export function RouteMap({ coords }: { coords: [number, number][] }) {
  if (coords.length === 0) return null
  return (
    <MapContainer
      center={coords[0]}
      zoom={13}
      style={{ height: '240px', width: '100%' }}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Polyline positions={coords} pathOptions={{ color: '#2dd4bf', weight: 4, opacity: 0.9 }} />
      <FitBounds coords={coords} />
    </MapContainer>
  )
}
