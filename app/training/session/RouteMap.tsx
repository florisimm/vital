'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Sets fitBounds on load and enforces maxBounds so the user can't pan far from the route
function MapController({ coords }: { coords: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (coords.length < 2) return
    const bounds = L.latLngBounds(coords)
    map.fitBounds(bounds, { padding: [20, 20] })

    // Expand bounds by ~50% in each direction to allow some panning but not wandering off
    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()
    const latPad = (ne.lat - sw.lat) * 0.8
    const lonPad = (ne.lng - sw.lng) * 0.8
    map.setMaxBounds([
      [sw.lat - latPad, sw.lng - lonPad],
      [ne.lat + latPad, ne.lng + lonPad],
    ])
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
      scrollWheelZoom={true}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Polyline positions={coords} pathOptions={{ color: '#2dd4bf', weight: 4, opacity: 0.9 }} />
      <MapController coords={coords} />
    </MapContainer>
  )
}
