'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ChevronLeft, Bike, PersonStanding, Dumbbell, RefreshCw, Map, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Card } from '@/components/ui'

const RouteMap = dynamic(() => import('./RouteMap').then(m => m.RouteMap), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

type SportType = 'cycling' | 'running' | 'strength' | 'other'
type TrainingType = 'herstel' | 'zone2' | 'tempo' | 'interval' | 'lang'
type UserLevel = 'beginner' | 'intermediate' | 'advanced'

type Advice = {
  sport: SportType
  trainingType: TrainingType
  userLevel: UserLevel
  durationMin: number
  targetKm: number
  targetPace: string | null   // running: mm:ss/km
  targetSpeed: number | null  // cycling: km/h
  zone: string
  basis: string
}

// ─── Sport detection ──────────────────────────────────────────────────────────

function detectSport(title: string): SportType {
  const t = title.toLowerCase()
  if (['fietsen', 'ride', 'cycling', 'wielren', 'cycl'].some(k => t.includes(k))) return 'cycling'
  if (['hardlopen', 'run', 'loop', 'duurloop', 'interval', 'tempo'].some(k => t.includes(k))) return 'running'
  if (['gym', 'strength', 'push', 'pull', 'squat', 'crossfit'].some(k => t.includes(k))) return 'strength'
  return 'other'
}

// ─── Algorithm helpers ────────────────────────────────────────────────────────

function matchesSport(a: any, sport: SportType): boolean {
  const s = (a.sport_type ?? '').toLowerCase()
  if (sport === 'cycling') return s.includes('ride') || s.includes('cycl')
  if (sport === 'running') return s.includes('run')
  return false
}

// Returns average pace in seconds/km for running activities
function avgPaceSecPerKm(acts: any[]): number {
  const valid = acts.filter(a => a.average_speed > 0)
  if (!valid.length) return 360 // default 6:00/km
  const mps = valid.reduce((s: number, a: any) => s + a.average_speed, 0) / valid.length
  return 1000 / mps
}

// Returns average speed in km/h for cycling activities
function avgSpeedKmh(acts: any[]): number {
  const valid = acts.filter(a => a.average_speed > 0)
  if (!valid.length) return 25
  return valid.reduce((s: number, a: any) => s + a.average_speed, 0) / valid.length * 3.6
}

// Average weekly km over the last 4 weeks (of matching-sport activities)
function weeklyAvgKm(acts: any[]): number {
  const now = Date.now()
  const weeks = [0, 1, 2, 3].map(w => {
    const lo = now - (w + 1) * 7 * 86400000
    const hi = now - w * 7 * 86400000
    return acts
      .filter(a => { const d = new Date(a.start_date).getTime(); return d >= lo && d < hi })
      .reduce((s: number, a: any) => s + (a.distance ?? 0) / 1000, 0)
  })
  const nonZero = weeks.filter(w => w > 0)
  return nonZero.length ? Math.round(nonZero.reduce((s, w) => s + w, 0) / nonZero.length) : 0
}

// Days since most recent matching-sport activity
function daysSinceLast(acts: any[]): number {
  if (!acts.length) return 99
  return (Date.now() - new Date(acts[0].start_date).getTime()) / 86400000
}

function determineUserLevel(acts: any[], sport: SportType): UserLevel {
  if (acts.length < 3) return 'beginner'
  const recent = acts.slice(0, 8)
  const avgDistKm = recent.reduce((s: number, a: any) => s + (a.distance ?? 0), 0) / recent.length / 1000

  if (sport === 'running') {
    const secPerKm = avgPaceSecPerKm(recent)
    if (avgDistKm >= 12 || secPerKm < 270) return 'advanced'    // >12 km avg or sub-4:30
    if (avgDistKm >= 6  || secPerKm < 360) return 'intermediate' // >6 km avg or sub-6:00
    return 'beginner'
  }
  if (sport === 'cycling') {
    const spd = avgSpeedKmh(recent)
    if (avgDistKm >= 70 || spd >= 32) return 'advanced'
    if (avgDistKm >= 35 || spd >= 25) return 'intermediate'
    return 'beginner'
  }
  return 'beginner'
}

function detectTrainingType(title: string, acts: any[]): TrainingType {
  const t = title.toLowerCase()
  if (['herstel', 'recovery', 'easy', 'rustig', 'actief herstel'].some(k => t.includes(k))) return 'herstel'
  if (['interval', 'fartlek', 'herhaling', 'snelheid', 'vo2'].some(k => t.includes(k))) return 'interval'
  if (['tempo', 'drempel', 'threshold', 'lactaat'].some(k => t.includes(k))) return 'tempo'
  if (['lange duur', 'long run', 'lsd', '2u', '90min', 'lange rit'].some(k => t.includes(k))) return 'lang'
  // "duurloop" without "lange" → zone2
  // Context: trained yesterday → herstel
  if (daysSinceLast(acts) < 1.5 && acts.length > 0) return 'herstel'
  return 'zone2'
}

// Duration table (minutes) by training type × level
const DURATION: Record<TrainingType, Record<UserLevel, number>> = {
  herstel:  { beginner: 25, intermediate: 35, advanced: 40  },
  zone2:    { beginner: 40, intermediate: 60, advanced: 75  },
  tempo:    { beginner: 30, intermediate: 40, advanced: 50  },
  interval: { beginner: 35, intermediate: 45, advanced: 55  },
  lang:     { beginner: 55, intermediate: 80, advanced: 110 },
}

// Running: seconds/km offset relative to user's avg pace
const RUN_PACE_OFFSET: Record<TrainingType, number> = {
  herstel: +90, zone2: +45, tempo: -30, interval: -60, lang: +30,
}

// Cycling: fraction of user's avg speed
const CYCLE_SPEED_FACTOR: Record<TrainingType, number> = {
  herstel: 0.75, zone2: 0.85, tempo: 0.95, interval: 1.0, lang: 0.80,
}

const ZONE: Record<TrainingType, string> = {
  herstel: 'Zone 1', zone2: 'Zone 2', tempo: 'Zone 3–4', interval: 'Zone 4–5', lang: 'Zone 2',
}

const TYPE_LABEL: Record<TrainingType, string> = {
  herstel: 'Herstel', zone2: 'Zone 2', tempo: 'Tempo', interval: 'Interval', lang: 'Lange duur',
}

// ─── Core algorithm ───────────────────────────────────────────────────────────

function computeAdvice(sport: SportType, activities: any[], title: string): Advice {
  const matching = activities.filter(a => matchesSport(a, sport))

  const trainingType = detectTrainingType(title, matching)
  const userLevel = determineUserLevel(matching, sport)
  const wkly = weeklyAvgKm(matching)

  // Duration: base from table, tiny boost for high-volume athletes
  let durationMin = DURATION[trainingType][userLevel]
  if (wkly > 60 && trainingType !== 'herstel') durationMin = Math.round(durationMin * 1.1)
  if (wkly > 0 && wkly < 20 && trainingType !== 'herstel') durationMin = Math.round(durationMin * 0.9)

  const zone = ZONE[trainingType]
  const levelLabel = userLevel === 'beginner' ? 'Beginner' : userLevel === 'intermediate' ? 'Gemiddeld' : 'Gevorderd'

  if (sport === 'running') {
    const baseSecPerKm = matching.length ? avgPaceSecPerKm(matching) : 360
    const targetSecPerKm = Math.max(180, baseSecPerKm + RUN_PACE_OFFSET[trainingType])
    const paceMin = Math.floor(targetSecPerKm / 60)
    const paceSec = Math.round(targetSecPerKm % 60)
    const targetPace = `${paceMin}:${paceSec.toString().padStart(2, '0')}`
    // distance = duration ÷ pace  (both in minutes/km and minutes → km)
    const targetKm = Math.round((durationMin / (targetSecPerKm / 60)) * 10) / 10

    const parts = [`${TYPE_LABEL[trainingType]} · ${durationMin} min`, `${levelLabel}`]
    if (wkly) parts.push(`~${wkly} km/week`)

    return { sport, trainingType, userLevel, durationMin, targetKm, targetPace, targetSpeed: null, zone, basis: parts.join(' · ') }
  }

  if (sport === 'cycling') {
    const baseSpeedKmh = matching.length ? avgSpeedKmh(matching) : 25
    const targetSpeed = Math.max(10, Math.round(baseSpeedKmh * CYCLE_SPEED_FACTOR[trainingType]))
    // distance = duration × speed  (hours × km/h → km)
    const targetKm = Math.round((durationMin / 60) * targetSpeed * 10) / 10

    const parts = [`${TYPE_LABEL[trainingType]} · ${durationMin} min`, `${levelLabel}`]
    if (wkly) parts.push(`~${wkly} km/week`)

    return { sport, trainingType, userLevel, durationMin, targetKm, targetPace: null, targetSpeed, zone, basis: parts.join(' · ') }
  }

  return { sport, trainingType: 'zone2', userLevel: 'beginner', durationMin: 0, targetKm: 0, targetPace: null, targetSpeed: null, zone: '–', basis: '–' }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<TrainingType, string> = {
  herstel: 'text-teal-400',
  zone2: 'text-indigo-400',
  tempo: 'text-orange-400',
  interval: 'text-red-400',
  lang: 'text-cyan-400',
}

function SportIcon({ sport }: { sport: SportType }) {
  if (sport === 'cycling') return <Bike size={28} className="text-cyan-400" />
  if (sport === 'running') return <PersonStanding size={28} className="text-teal-400" />
  return <Dumbbell size={28} className="text-orange-400" />
}

function MetricCard({ label, value, unit, color }: { label: string; value: string; unit: string; color?: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className={`text-[38px] font-bold leading-none ${color ?? 'text-white'}`}>{value}</span>
          <span className="text-[15px] text-white/50">{unit}</span>
        </div>
      </div>
    </Card>
  )
}

// ─── Route helpers ────────────────────────────────────────────────────────────

function orsProfile(sport: SportType, mainRoad: boolean, mtb: boolean): string {
  if (sport === 'cycling') {
    if (mtb) return 'cycling-mountain'
    if (mainRoad) return 'cycling-road'
    return 'cycling-regular'
  }
  return 'foot-walking'
}

async function orsRoundTrip(
  lat: number, lon: number, targetKm: number, sport: SportType, seed: number,
  avoidHills = false, mainRoad = false, mtb = false
): Promise<{ coords: [number, number][]; actualKm: number }> {
  const profile = orsProfile(sport, mainRoad, mtb)
  const avoidFeatures = avoidHills ? ['hills'] : []
  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.NEXT_PUBLIC_ORS_API_KEY ?? '',
      },
      body: JSON.stringify({
        coordinates: [[lon, lat]],
        options: {
          ...(avoidFeatures.length ? { avoid_features: avoidFeatures } : {}),
          round_trip: { length: Math.round(targetKm * 1000), points: 5, seed },
        },
      }),
    }
  )
  const json = await res.json()
  const feature = json.features?.[0]
  if (!feature) throw new Error('No route')
  return {
    coords: (feature.geometry.coordinates as [number, number][]).map(([ln, lt]) => [lt, ln] as [number, number]),
    actualKm: Math.round(feature.properties.summary.distance / 100) / 10,
  }
}

function buildGpx(coords: [number, number][], name: string): string {
  const pts = coords.map(([lt, ln]) => `    <trkpt lat="${lt.toFixed(6)}" lon="${ln.toFixed(6)}"></trkpt>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Vital">\n  <trk><name>${name}</name><trkseg>\n${pts}\n  </trkseg></trk>\n</gpx>`
}

async function orsDirectRoute(
  startLat: number, startLon: number, endLat: number, endLon: number,
  sport: SportType, avoidHills = false, mainRoad = false, mtb = false
): Promise<{ coords: [number, number][]; actualKm: number }> {
  const profile = orsProfile(sport, mainRoad, mtb)
  const avoidFeatures = avoidHills ? ['hills'] : []
  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': process.env.NEXT_PUBLIC_ORS_API_KEY ?? '' },
      body: JSON.stringify({
        coordinates: [[startLon, startLat], [endLon, endLat]],
        ...(avoidFeatures.length ? { options: { avoid_features: avoidFeatures } } : {}),
      }),
    }
  )
  const json = await res.json()
  const feature = json.features?.[0]
  if (!feature) throw new Error('No route')
  return {
    coords: (feature.geometry.coordinates as [number, number][]).map(([ln, lt]) => [lt, ln] as [number, number]),
    actualKm: Math.round(feature.properties.summary.distance / 100) / 10,
  }
}

async function nominatim(query: string): Promise<[number, number]> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`)
  const json = await res.json()
  if (!json.length) throw new Error('not found')
  return [parseFloat(json[0].lat), parseFloat(json[0].lon)]
}

// ─── Route map card ───────────────────────────────────────────────────────────

function RouteMapCard({ advice, title, sport }: { advice: Advice; title: string; sport: SportType }) {
  const [routeMode, setRouteMode] = useState<'loop' | 'atob'>('loop')
  const [distanceInput, setDistanceInput] = useState(String(advice.targetKm))
  const [heuvels, setHeuvels] = useState(true)
  const [groteWeg, setGroteWeg] = useState(false)
  const [mtb, setMtb] = useState(false)
  const [locMode, setLocMode] = useState<'gps' | 'manual'>('gps')
  const [fromQuery, setFromQuery] = useState('')
  const [toQuery, setToQuery] = useState('')
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null)
  const [actualKm, setActualKm] = useState<number | null>(null)
  const [startCoord, setStartCoord] = useState<[number, number] | null>(null)
  const [endCoord, setEndCoord] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seedRef = useRef(Math.floor(Math.random() * 10000))

  function parsedKm() { return Math.max(1, parseFloat(distanceInput) || advice.targetKm) }

  async function generateLoop(lat: number, lon: number) {
    setLoading(true); setError(null); setStartCoord([lat, lon])
    try {
      const result = await orsRoundTrip(lat, lon, parsedKm(), sport, seedRef.current, !heuvels, groteWeg, mtb)
      setRouteCoords(result.coords); setActualKm(result.actualKm)
    } catch { setError('Kon geen route laden') }
    finally { setLoading(false) }
  }

  function triggerGps() {
    setLocMode('gps'); setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => { if (routeMode === 'loop') generateLoop(pos.coords.latitude, pos.coords.longitude); else setStartCoord([pos.coords.latitude, pos.coords.longitude]) },
      () => { setLocMode('manual'); setError('Locatie toegang geweigerd') }
    )
  }

  async function geocodeFrom() {
    if (!fromQuery.trim()) return
    setLoading(true); setError(null)
    try {
      const coord = await nominatim(fromQuery)
      setStartCoord(coord)
      if (routeMode === 'loop') await generateLoop(coord[0], coord[1])
    } catch { setError('Vertrekpunt niet gevonden') }
    finally { setLoading(false) }
  }

  async function routeAtoB() {
    setLoading(true); setError(null)
    try {
      let start = startCoord
      if (!start) {
        if (locMode === 'gps') {
          start = await new Promise<[number, number]>((res, rej) =>
            navigator.geolocation.getCurrentPosition(p => res([p.coords.latitude, p.coords.longitude]), rej)
          )
          setStartCoord(start)
        } else if (fromQuery.trim()) {
          start = await nominatim(fromQuery)
          setStartCoord(start)
        } else { setError('Voer een vertrekpunt in'); setLoading(false); return }
      }
      if (!toQuery.trim()) { setError('Voer een bestemming in'); setLoading(false); return }
      const end = await nominatim(toQuery)
      setEndCoord(end)
      const result = await orsDirectRoute(start[0], start[1], end[0], end[1], sport, !heuvels, groteWeg, mtb)
      setRouteCoords(result.coords); setActualKm(result.actualKm)
    } catch (e: any) {
      setError(e?.message === 'not found' ? 'Bestemming niet gevonden' : 'Kon geen route laden')
    }
    finally { setLoading(false) }
  }

  function retry() {
    seedRef.current = Math.floor(Math.random() * 10000)
    if (locMode === 'gps') triggerGps()
    else if (startCoord) generateLoop(startCoord[0], startCoord[1])
  }

  function openGoogleMaps() {
    if (!startCoord) return
    const mode = sport === 'cycling' ? 'bicycling' : 'walking'
    const dest = (routeMode === 'atob' && endCoord) ? `${endCoord[0]},${endCoord[1]}` : `${startCoord[0]},${startCoord[1]}`
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${startCoord[0]},${startCoord[1]}&destination=${dest}&travelmode=${mode}`, '_blank')
  }

  function downloadGpx() {
    if (!routeCoords) return
    const gpx = buildGpx(routeCoords, title)
    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.gpx`; a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => { triggerGps() }, [])

  return (
    <div className="rounded-[18px] overflow-hidden border border-white/[0.09]" style={{ background: 'rgba(255,255,255,0.075)' }}>
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">

        {/* Route mode toggle */}
        <div className="flex gap-2">
          {(['loop', 'atob'] as const).map(m => (
            <button key={m} onClick={() => setRouteMode(m)}
              className="flex-1 h-[36px] rounded-full text-[14px] font-semibold"
              style={routeMode === m ? { background: 'white', color: 'black' } : { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)' }}>
              {m === 'loop' ? '🔄 Rondje' : '→ A naar B'}
            </button>
          ))}
        </div>

        {/* Start location picker */}
        <div className="flex gap-2">
          {(['gps', 'manual'] as const).map(mode => (
            <button key={mode}
              onClick={mode === 'gps' ? triggerGps : () => setLocMode('manual')}
              className="flex-1 h-[36px] rounded-full text-[14px] font-semibold"
              style={locMode === mode ? { background: 'rgba(255,255,255,0.22)', color: 'white' } : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>
              {mode === 'gps' ? 'Huidige locatie' : 'Locatie invoeren'}
            </button>
          ))}
        </div>
        {locMode === 'manual' && routeMode === 'loop' && (
          <div className="flex gap-2">
            <input value={fromQuery} onChange={e => setFromQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && geocodeFrom()}
              placeholder="Stad of adres…"
              className="flex-1 h-[40px] px-3 rounded-[12px] text-white placeholder:text-white/30 outline-none text-[15px] border border-white/[0.09]"
              style={{ background: 'rgba(255,255,255,0.08)' }} />
            <button onClick={geocodeFrom} className="h-[40px] px-4 rounded-[12px] bg-white text-black text-[14px] font-semibold">Zoek</button>
          </div>
        )}

        {/* A→B destination */}
        {routeMode === 'atob' && (
          <>
            {locMode === 'manual' && (
              <input value={fromQuery} onChange={e => setFromQuery(e.target.value)}
                placeholder="Vertrekpunt (dorp of stad)…"
                className="h-[40px] px-3 rounded-[12px] text-white placeholder:text-white/30 outline-none text-[15px] border border-white/[0.09]"
                style={{ background: 'rgba(255,255,255,0.08)' }} />
            )}
            <div className="flex gap-2">
              <input value={toQuery} onChange={e => setToQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && routeAtoB()}
                placeholder="Bestemming (dorp of stad)…"
                className="flex-1 h-[40px] px-3 rounded-[12px] text-white placeholder:text-white/30 outline-none text-[15px] border border-white/[0.09]"
                style={{ background: 'rgba(255,255,255,0.08)' }} />
              <button onClick={routeAtoB} className="h-[40px] px-4 rounded-[12px] bg-white text-black text-[14px] font-semibold">Routeer</button>
            </div>
          </>
        )}

        {/* Distance (loop only) */}
        {routeMode === 'loop' && (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-white/50 shrink-0">Afstand</span>
            <input type="number" value={distanceInput} onChange={e => setDistanceInput(e.target.value)}
              min={1} max={300} step={0.5}
              className="w-[64px] h-[32px] px-2 rounded-[10px] text-white text-[15px] font-semibold text-center outline-none border border-white/[0.09]"
              style={{ background: 'rgba(255,255,255,0.08)' }} />
            <span className="text-[13px] text-white/50">km</span>
            <span className="text-[12px] text-white/25 ml-1">(aanbevolen: {advice.targetKm} km)</span>
          </div>
        )}

        {/* Route option toggles */}
        <div className="flex flex-wrap gap-2">
          <RouteToggle active={heuvels} onToggle={() => setHeuvels(v => !v)} label="⛰️ Heuvels" />
          {sport === 'cycling' && (
            <>
              <RouteToggle active={groteWeg} onToggle={() => { setGroteWeg(v => !v); setMtb(false) }} label="🛣️ Grote weg" />
              <RouteToggle active={mtb} onToggle={() => { setMtb(v => !v); setGroteWeg(false) }} label="🏔️ MTB" />
            </>
          )}
        </div>
      </div>

      {/* Map */}
      {loading ? (
        <div className="animate-pulse mx-4 mb-4 rounded-[12px]" style={{ height: 240, background: 'rgba(255,255,255,0.06)' }} />
      ) : error && !routeCoords ? (
        <div className="mx-4 mb-4 rounded-[12px] flex items-center justify-center" style={{ height: 240, background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-white/40 text-[14px]">{error}</p>
        </div>
      ) : routeCoords ? (
        <div className="mx-4 mb-4 rounded-[12px] overflow-hidden" style={{ height: 240 }}>
          <RouteMap coords={routeCoords} />
        </div>
      ) : null}

      {/* Actual route distance */}
      {routeCoords && actualKm !== null && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <span className="text-[13px] text-white/40">Route afstand:</span>
          <span className="text-[15px] font-semibold text-white">{actualKm} km</span>
          {routeMode === 'loop' && <span className="text-[13px] text-white/30">· doel {parsedKm()} km</span>}
        </div>
      )}

      {/* Buttons */}
      {routeCoords && (
        <div className="px-4 pb-4 flex gap-2">
          {routeMode === 'loop' && (
            <button onClick={retry} className="flex items-center gap-1.5 h-[40px] px-3 rounded-[12px] text-[13px] font-semibold" style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}>
              <RefreshCw size={14} />Nieuwe route
            </button>
          )}
          <button onClick={openGoogleMaps} className="flex items-center gap-1.5 h-[40px] px-3 rounded-[12px] text-[13px] font-semibold flex-1 justify-center" style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}>
            <Map size={14} />Google Maps
          </button>
          <button onClick={downloadGpx} className="flex items-center gap-1.5 h-[40px] px-3 rounded-[12px] text-[13px] font-semibold" style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}>
            <Download size={14} />Strava
          </button>
        </div>
      )}
    </div>
  )
}

function RouteToggle({ active, onToggle, label }: { active: boolean; onToggle: () => void; label: string }) {
  return (
    <button onClick={onToggle}
      className="flex items-center gap-1.5 h-[32px] px-3 rounded-full text-[13px] font-semibold"
      style={active ? { background: 'white', color: 'black' } : { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)' }}>
      {label}
    </button>
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
      const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()
      const { data: activities } = await supabase
        .from('strava_activities')
        .select('sport_type,distance,moving_time,average_speed,average_heartrate,start_date')
        .eq('user_id', user.id)
        .gte('start_date', sixtyDaysAgo)
        .order('start_date', { ascending: false })
      setAdvice(computeAdvice(sport, activities ?? [], title))
    }
    load()
  }, [sport, title])

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
        <span className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-white">Session plan</span>
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
          {[100, 80, 80, 280].map((h, i) => (
            <div key={i} className="animate-pulse rounded-3xl" style={{ height: h, background: 'rgba(255,255,255,0.08)' }} />
          ))}
        </div>
      ) : sport === 'strength' ? (
        <Card>
          <div className="flex flex-col gap-3">
            <p className="text-[17px] font-semibold text-white">Kracht training</p>
            <p className="text-white/50 text-[15px] leading-relaxed">Koppel Hevy voor automatisch advies op basis van je trainingshistorie.</p>
          </div>
        </Card>
      ) : sport === 'other' ? (
        <Card>
          <p className="text-white/50 text-[15px]">Geen specifiek advies beschikbaar voor dit type training.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Row 1: training type + duration */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Type" value={TYPE_LABEL[advice.trainingType]} unit="" color={TYPE_COLOR[advice.trainingType]} />
            <MetricCard label="Duur" value={String(advice.durationMin)} unit="min" />
          </div>

          {/* Row 2: distance + pace/speed */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Afstand" value={String(advice.targetKm)} unit="km" />
            {advice.targetPace !== null && (
              <MetricCard label="Tempo" value={advice.targetPace} unit="/km" />
            )}
            {advice.targetSpeed !== null && (
              <MetricCard label="Snelheid" value={String(advice.targetSpeed)} unit="km/h" />
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
