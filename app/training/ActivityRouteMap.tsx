'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    coords.push([lat / 1e5, lng / 1e5])
  }
  return coords
}

function Fitter({ coords }: { coords: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (coords.length < 2) return
    map.fitBounds(L.latLngBounds(coords), { padding: [20, 20] })
  }, [coords, map])
  return null
}

export function ActivityRouteMap({ polyline }: { polyline: string }) {
  const coords = decodePolyline(polyline)
  if (coords.length === 0) return null
  return (
    <MapContainer
      center={coords[0]}
      zoom={13}
      style={{ height: '220px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      <Polyline
        positions={coords}
        pathOptions={{ color: 'rgb(45,212,191)', weight: 3.5, opacity: 0.9 }}
      />
      <Fitter coords={coords} />
    </MapContainer>
  )
}
