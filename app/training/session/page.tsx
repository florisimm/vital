'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ChevronLeft, Bike, PersonStanding, Dumbbell, RefreshCw, Map, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Card } from '@/components/ui'

const RouteMap = dynamic(() => import('./RouteMap').then(m => m.RouteMap), { ssr: false })

type SportType = 'cycling' | 'running' | 'strength' | 'other'

function detectSport(title: string): SportType {
  const t = title.toLowerCase()
  if (['fietsen', 'ride', 'cycling', 'wielren', 'cycl'].some(k => t.includes(k))) return 'cycling'
  if (['hardlopen', 'run', 'loop', 'duurloop', 'interval', 'tempo'].some(k => t.includes(k))) return 'running'
  if (['gym', 'strength', 'push', 'pull', 'squat', 'crossfit'].some(k => t.includes(k))) return 'strength'
  return 'other'
}

type Advice = {
  sport: SportType
  targetKm: number | null
  targetPace: string | null
  targetSpeed: number | null
  zone: string
  basis: string
}

function computeAdvice(sport: SportType, activities: any[]): Advice {
  const recent = activities
    .filter(a => {
      const s = a.sport_type?.toLowerCase() ?? ''
      if (sport === 'cycling') return s.includes('ride') || s.includes('cycl')
      if (sport === 'running') return s.includes('run')
      return false
    })
    .slice(0, 5)

  if (sport === 'cycling') {
    if (recent.length === 0) {
      return { sport, targetKm: 40, targetSpeed: 28, targetPace: null, zone: 'Zone 2', basis: 'Standaard advies (geen recente ritten)' }
    }
    const avgKm = recent.reduce((s: number, a: any) => s + (a.distance ?? 0), 0) / recent.length / 1000
    const speedRides = recent.filter((a: any) => a.average_speed)
    const avgSpeed = speedRides.length
      ? speedRides.reduce((s: number, a: any) => s + a.average_speed, 0) / speedRides.length * 3.6
      : 28
    return {
      sport,
      targetKm: Math.round(avgKm / 5) * 5 || 40,
      targetSpeed: Math.round(avgSpeed),
      targetPace: null,
      zone: 'Zone 2',
      basis: `Gebaseerd op je laatste ${recent.length} rit${recent.length > 1 ? 'ten' : ''}`,
    }
  }

  if (sport === 'running') {
    if (recent.length === 0) {
      return { sport, targetKm: 8, targetSpeed: null, targetPace: '5:30', zone: 'Zone 2', basis: 'Standaard advies (geen recente runs)' }
    }
    const avgKm = recent.reduce((s: number, a: any) => s + (a.distance ?? 0), 0) / recent.length / 1000
    const paceRuns = recent.filter((a: any) => a.average_speed && a.average_speed > 0)
    let targetPace: string | null = null
    if (paceRuns.length) {
      const avgMps = paceRuns.reduce((s: number, a: any) => s + a.average_speed, 0) / paceRuns.length
      const secPerKm = 1000 / avgMps
      targetPace = `${Math.floor(secPerKm / 60)}:${Math.round(secPerKm % 60).toString().padStart(2, '0')}`
    }
    return {
      sport,
      targetKm: Math.round(avgKm / 2) * 2 || 8,
      targetSpeed: null,
      targetPace,
      zone: 'Zone 2',
      basis: `Gebaseerd op je laatste ${recent.length} run${recent.length > 1 ? 's' : ''}`,
    }
  }

  return { sport, targetKm: null, targetSpeed: null, targetPace: null, zone: '–', basis: '–' }
}

function SportIcon({ sport }: { sport: SportType }) {
  if (sport === 'cycling') return <Bike size={28} className="text-cyan-400" />
  if (sport === 'running') return <PersonStanding size={28} className="text-teal-400" />
  return <Dumbbell size={28} className="text-orange-400" />
}

// ─── Route helpers ────────────────────────────────────────────────────────────

async function fetchRoute(
  lat: number, lon: number, targetKm: number, sport: SportType, rotation: number
): Promise<[number, number][]> {
  const radius = targetKm / (2 * Math.PI)
  const latDeg = 1 / 111
  const lonDeg = 1 / (111 * Math.cos((lat * Math.PI) / 180))
  const angles = [0, 90, 180, 270].map(a => ((a + rotation) * Math.PI) / 180)
  const waypoints: [number, number][] = angles.map(a => [
    lat + Math.cos(a) * radius * latDeg,
    lon + Math.sin(a) * radius * lonDeg,
  ])
  const all: [number, number][] = [[lat, lon], ...waypoints, [lat, lon]]
  const coordStr = all.map(([lt, ln]) => `${ln},${lt}`).join(';')
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
  )
  const json = await res.json()
  return (json.routes[0].geometry.coordinates as [number, number][]).map(
    ([ln, lt]) => [lt, ln] as [number, number]
  )
}

function buildGpx(coords: [number, number][], name: string): string {
  const pts = coords.map(([lt, ln]) => `    <trkpt lat="${lt.toFixed(6)}" lon="${ln.toFixed(6)}"></trkpt>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Vital">
  <trk><name>${name}</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`
}

function buildGoogleMapsUrl(start: [number, number], coords: [number, number][], sport: SportType): string {
  const [lat, lon] = start
  const mode = sport === 'cycling' ? 'bicycling' : 'walking'
  const step = Math.max(1, Math.floor(coords.length / 8))
  const wps = coords
    .filter((_, i) => i % step === 0 && i > 0 && i < coords.length - 1)
    .slice(0, 8)
    .map(([lt, ln]) => `${lt.toFixed(5)},${ln.toFixed(5)}`)
    .join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${lat},${lon}&waypoints=${wps}&travelmode=${mode}`
}

// ─── Route map card ───────────────────────────────────────────────────────────

function RouteMapCard({ advice, title, sport }: { advice: Advice; title: string; sport: SportType }) {
  const targetKm = advice.targetKm ?? 10
  const [locMode, setLocMode] = useState<'gps' | 'manual'>('gps')
  const [manualQuery, setManualQuery] = useState('')
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null)
  const [startCoord, setStartCoord] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rotationRef = useRef(0)

  async function generateFromCoords(lat: number, lon: number) {
    setLoading(true)
    setError(null)
    try {
      const coords = await fetchRoute(lat, lon, targetKm, sport, rotationRef.current)
      setRouteCoords(coords)
      setStartCoord([lat, lon])
    } catch {
      setError('Kon geen route laden')
    } finally {
      setLoading(false)
    }
  }

  function triggerGps() {
    setLocMode('gps')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => generateFromCoords(pos.coords.latitude, pos.coords.longitude),
      () => { setLocMode('manual'); setError('Locatie toegang geweigerd') }
    )
  }

  async function geocodeAndGenerate() {
    if (!manualQuery.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(manualQuery)}&format=json&limit=1`
      )
      const json = await res.json()
      if (!json.length) { setError('Locatie niet gevonden'); setLoading(false); return }
      await generateFromCoords(parseFloat(json[0].lat), parseFloat(json[0].lon))
    } catch {
      setError('Kon locatie niet ophalen')
      setLoading(false)
    }
  }

  function retry() {
    rotationRef.current = (rotationRef.current + 45) % 360
    if (locMode === 'gps') {
      triggerGps()
    } else if (startCoord) {
      generateFromCoords(startCoord[0], startCoord[1])
    }
  }

  function openGoogleMaps() {
    if (!startCoord || !routeCoords) return
    window.open(buildGoogleMapsUrl(startCoord, routeCoords, sport), '_blank')
  }

  function downloadGpx() {
    if (!routeCoords) return
    const gpx = buildGpx(routeCoords, title)
    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.gpx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Auto-trigger GPS on first render
  useEffect(() => { triggerGps() }, [])

  return (
    <div
      className="rounded-[18px] overflow-hidden border border-white/[0.09]"
      style={{ background: 'rgba(255,255,255,0.075)' }}
    >
      {/* Location picker */}
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
        <div className="flex gap-2">
          <button
            onClick={triggerGps}
            className="flex-1 h-[36px] rounded-full text-[14px] font-semibold transition-colors"
            style={locMode === 'gps'
              ? { background: 'white', color: 'black' }
              : { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)' }}
          >
            Huidige locatie
          </button>
          <button
            onClick={() => setLocMode('manual')}
            className="flex-1 h-[36px] rounded-full text-[14px] font-semibold transition-colors"
            style={locMode === 'manual'
              ? { background: 'white', color: 'black' }
              : { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)' }}
          >
            Locatie invoeren
          </button>
        </div>

        {locMode === 'manual' && (
          <div className="flex gap-2">
            <input
              value={manualQuery}
              onChange={e => setManualQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && geocodeAndGenerate()}
              placeholder="Stad of adres…"
              className="flex-1 h-[40px] px-3 rounded-[12px] text-white placeholder:text-white/30 outline-none text-[15px] border border-white/[0.09]"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            />
            <button
              onClick={geocodeAndGenerate}
              className="h-[40px] px-4 rounded-[12px] bg-white text-black text-[14px] font-semibold"
            >
              Zoek
            </button>
          </div>
        )}
      </div>

      {/* Map area */}
      {loading ? (
        <div className="animate-pulse mx-4 mb-4 rounded-[12px]"
          style={{ height: 240, background: 'rgba(255,255,255,0.06)' }} />
      ) : error && !routeCoords ? (
        <div className="mx-4 mb-4 rounded-[12px] flex items-center justify-center"
          style={{ height: 240, background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-white/40 text-[14px]">{error}</p>
        </div>
      ) : routeCoords ? (
        <div className="mx-4 mb-4 rounded-[12px] overflow-hidden" style={{ height: 240 }}>
          <RouteMap coords={routeCoords} />
        </div>
      ) : null}

      {/* Action buttons */}
      {routeCoords && (
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={retry}
            className="flex items-center gap-1.5 h-[40px] px-3 rounded-[12px] text-[13px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}
          >
            <RefreshCw size={14} />
            Opnieuw
          </button>
          <button
            onClick={openGoogleMaps}
            className="flex items-center gap-1.5 h-[40px] px-3 rounded-[12px] text-[13px] font-semibold flex-1 justify-center"
            style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}
          >
            <Map size={14} />
            Google Maps
          </button>
          <button
            onClick={downloadGpx}
            className="flex items-center gap-1.5 h-[40px] px-3 rounded-[12px] text-[13px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}
          >
            <Download size={14} />
            Strava
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Session content ──────────────────────────────────────────────────────────

function SessionContent() {
  const params = useSearchParams()
  const router = useRouter()
  const title = params.get('title') ?? 'Training'
  const time = params.get('time')
  const sport = detectSport(title)
  const [advice, setAdvice] = useState<Advice | null>(null)

  const timeLabel = time
    ? new Date(time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : null

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: activities } = await supabase
        .from('strava_activities')
        .select('sport_type,distance,moving_time,average_speed,average_heartrate')
        .eq('user_id', user.id)
        .gte('start_date', thirtyDaysAgo)
        .order('start_date', { ascending: false })
      setAdvice(computeAdvice(sport, activities ?? []))
    }
    load()
  }, [sport])

  return (
    <div
      className="min-h-screen px-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
      }}
    >
      {/* Nav */}
      <div className="relative flex items-center justify-between mb-8">
        <button onClick={() => router.back()} className="text-white/70">
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-white">
          Session plan
        </span>
        <div className="w-6" />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2 mb-8">
        <div className="flex items-center gap-3">
          {advice && <SportIcon sport={advice.sport} />}
          <div>
            <h1 className="text-[34px] font-bold text-white leading-tight">{title}</h1>
            {timeLabel && <p className="text-[15px] text-white/50">Vandaag om {timeLabel}</p>}
          </div>
        </div>
      </div>

      {!advice ? (
        <div className="flex flex-col gap-4">
          {[100, 80, 80].map((h, i) => (
            <div key={i} className="animate-pulse rounded-3xl" style={{ height: h, background: 'rgba(255,255,255,0.08)' }} />
          ))}
        </div>
      ) : sport === 'strength' ? (
        <Card>
          <div className="flex flex-col gap-3">
            <p className="text-[17px] font-semibold text-white">Kracht training</p>
            <p className="text-white/50 text-[15px] leading-relaxed">
              Koppel Hevy voor automatisch advies op basis van je trainingshistorie.
            </p>
          </div>
        </Card>
      ) : sport === 'other' ? (
        <Card>
          <p className="text-white/50 text-[15px]">Geen specifiek advies beschikbaar voor dit type training.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Target metrics */}
          <div className="grid grid-cols-2 gap-3">
            {advice.targetKm !== null && (
              <Card>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">Doel afstand</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[42px] font-bold text-white leading-none">{advice.targetKm}</span>
                    <span className="text-[17px] text-white/50">km</span>
                  </div>
                </div>
              </Card>
            )}
            {advice.targetSpeed !== null && (
              <Card>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">Doel tempo</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[42px] font-bold text-white leading-none">{advice.targetSpeed}</span>
                    <span className="text-[17px] text-white/50">km/h</span>
                  </div>
                </div>
              </Card>
            )}
            {advice.targetPace !== null && (
              <Card>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">Doel tempo</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[42px] font-bold text-white leading-none">{advice.targetPace}</span>
                    <span className="text-[17px] text-white/50">/km</span>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Zone */}
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-semibold text-white">Hart slag zone</span>
              <span className="text-[17px] font-semibold text-teal-400">{advice.zone}</span>
            </div>
          </Card>

          {/* Route map */}
          <RouteMapCard advice={advice} title={title} sport={sport} />

          {/* Basis */}
          <p className="text-[13px] text-white/30 text-center">{advice.basis}</p>
        </div>
      )}
    </div>
  )
}

export default function SessionPage() {
  return (
    <Suspense>
      <SessionContent />
    </Suspense>
  )
}
