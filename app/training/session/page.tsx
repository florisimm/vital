'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ChevronLeft, Bike, PersonStanding, Dumbbell, RefreshCw, Map, Download, ArrowUp } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Card } from '@/components/ui'
import { formatTime as formatClockTime } from '@/lib/timeFormat'
import {
  detectSport, computeAdvice, TYPE_LABEL, TYPE_COLOR,
  type SportType, type Advice, type ComputeAdviceResult,
} from '@/lib/training-algorithm'
import { computeRecoveryDetail } from '../sections'

const RouteMap = dynamic(() => import('./RouteMap').then(m => m.RouteMap), { ssr: false })

// ─── Wind helpers ─────────────────────────────────────────────────────────────

type WindData = { speedKmh: number; directionDeg: number; compassLabel: string }

function degToCompass(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

async function fetchWind(lat: number, lon: number): Promise<WindData | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=windspeed_10m,winddirection_10m&wind_speed_unit=kmh&forecast_days=1`
    )
    const json = await res.json()
    const speed = Math.round(json?.current?.windspeed_10m ?? 0)
    const dir   = Math.round(json?.current?.winddirection_10m ?? 0)
    return { speedKmh: speed, directionDeg: dir, compassLabel: degToCompass(dir) }
  } catch { return null }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

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

function buildOrsOptions(sport: SportType, avoidHills: boolean) {
  return avoidHills && sport === 'cycling'
    ? { profile_params: { weightings: { steepness_difficulty: { value: 3 } } } }
    : {}
}

async function orsRoundTrip(
  lat: number, lon: number, targetKm: number, sport: SportType, seed: number,
  avoidHills = false, mainRoad = false, mtb = false
): Promise<{ coords: [number, number][]; actualKm: number }> {
  const profile = orsProfile(sport, mainRoad, mtb)
  const hillOptions = buildOrsOptions(sport, avoidHills)

  async function fetchRoute(km: number) {
    const res = await fetch('/api/route-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        body: {
          coordinates: [[lon, lat]],
          options: { ...hillOptions, round_trip: { length: Math.round(km * 1000), points: 3, seed } },
        },
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? `ORS ${res.status}`)
    const feature = json.features?.[0]
    if (!feature) throw new Error('No route')
    const actualKm = Math.round(feature.properties.summary.distance / 100) / 10
    const coords = (feature.geometry.coordinates as [number, number][]).map(([ln, lt]) => [lt, ln] as [number, number])
    return { coords, actualKm }
  }

  let best = await fetchRoute(targetKm)
  let adjustedKm = targetKm
  for (let i = 1; i < 5; i++) {
    if (Math.abs(best.actualKm - targetKm) / targetKm <= 0.10) break
    // Keep same seed so route direction stays consistent — only scale the distance
    adjustedKm = adjustedKm * (targetKm / best.actualKm)
    const attempt = await fetchRoute(adjustedKm)
    if (Math.abs(attempt.actualKm - targetKm) < Math.abs(best.actualKm - targetKm)) best = attempt
  }
  return best
}

function buildGpx(coords: [number, number][], name: string): string {
  const pts = coords.map(([lt, ln]) => `    <trkpt lat="${lt.toFixed(6)}" lon="${ln.toFixed(6)}"></trkpt>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Kern">\n  <trk><name>${name}</name><trkseg>\n${pts}\n  </trkseg></trk>\n</gpx>`
}

async function orsDirectRoute(
  startLat: number, startLon: number, endLat: number, endLon: number,
  sport: SportType, avoidHills = false, mainRoad = false, mtb = false
): Promise<{ coords: [number, number][]; actualKm: number }> {
  const profile = orsProfile(sport, mainRoad, mtb)
  const hillOptions = buildOrsOptions(sport, avoidHills)
  const res = await fetch('/api/route-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile,
      body: {
        coordinates: [[startLon, startLat], [endLon, endLat]],
        ...(Object.keys(hillOptions).length ? { options: hillOptions } : {}),
      },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `ORS ${res.status}`)
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
  const [distanceInput, setDistanceInput] = useState(String(advice.targetKm))
  const [heuvels, setHeuvels] = useState(true)
  const [groteWeg, setGroteWeg] = useState(false)
  const [mtb, setMtb] = useState(false)
  const [locMode, setLocMode] = useState<'gps' | 'manual'>('gps')
  const [fromQuery, setFromQuery] = useState('')
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null)
  const [actualKm, setActualKm] = useState<number | null>(null)
  const [startCoord, setStartCoord] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [windData, setWindData] = useState<WindData | null>(null)
  const seedRef = useRef(Math.floor(Math.random() * 10000))
  const kmRef = useRef(advice.targetKm)
  const startCoordRef = useRef<[number, number] | null>(null)
  const heuvelsRef = useRef(true)
  const groteWegRef = useRef(false)
  const mtbRef = useRef(false)

  // Keep refs in sync with latest state on every render
  kmRef.current = Math.max(1, parseFloat(distanceInput) || advice.targetKm)
  heuvelsRef.current = heuvels
  groteWegRef.current = groteWeg
  mtbRef.current = mtb

  function parsedKm() { return kmRef.current }

  // Ref to latest generateLoop so GPS callbacks never use a stale version
  const generateLoopRef = useRef<((lat: number, lon: number) => void) | null>(null)
  generateLoopRef.current = async (lat: number, lon: number) => {
    startCoordRef.current = [lat, lon]
    setStartCoord([lat, lon])
    setLoading(true); setError(null)
    fetchWind(lat, lon).then(w => { if (w) setWindData(w) })
    try {
      const result = await orsRoundTrip(lat, lon, kmRef.current, sport, seedRef.current, !heuvelsRef.current, groteWegRef.current, mtbRef.current)
      setRouteCoords(result.coords); setActualKm(result.actualKm)
    } catch (e: any) { setError(e?.message ? `Route error: ${e.message}` : 'Could not load route') }
    finally { setLoading(false) }
  }

  function generateLoop(lat: number, lon: number) { generateLoopRef.current!(lat, lon) }

  function triggerGps() {
    setLocMode('gps'); setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => generateLoopRef.current!(pos.coords.latitude, pos.coords.longitude),
      () => { setLocMode('manual'); setError('Location access denied') }
    )
  }

  async function geocodeFrom() {
    if (!fromQuery.trim()) return
    setLoading(true); setError(null)
    try {
      const coord = await nominatim(fromQuery)
      await generateLoopRef.current!(coord[0], coord[1])
    } catch { setError('Start location not found') }
    finally { setLoading(false) }
  }

  function retry() {
    seedRef.current = Math.floor(Math.random() * 10000)
    if (startCoordRef.current) generateLoopRef.current!(startCoordRef.current[0], startCoordRef.current[1])
    else triggerGps()
  }

  function openGoogleMaps() {
    if (!startCoord) return
    const mode = sport === 'cycling' ? 'bicycling' : 'walking'
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${startCoord[0]},${startCoord[1]}&destination=${startCoord[0]},${startCoord[1]}&travelmode=${mode}`, '_blank')
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

        {/* Location picker */}
        <div className="flex gap-2">
          {(['gps', 'manual'] as const).map(mode => (
            <button key={mode}
              onClick={mode === 'gps' ? triggerGps : () => setLocMode('manual')}
              className="flex-1 h-[36px] rounded-full text-[14px] font-semibold"
              style={locMode === mode ? { background: 'rgba(255,255,255,0.22)', color: 'white' } : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>
              {mode === 'gps' ? 'Current location' : 'Enter location'}
            </button>
          ))}
        </div>
        {locMode === 'manual' && (
          <div className="flex gap-2">
            <input value={fromQuery} onChange={e => setFromQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && geocodeFrom()}
              placeholder="City or address…"
              className="flex-1 h-[40px] px-3 rounded-[12px] text-white placeholder:text-white/30 outline-none text-[15px] border border-white/[0.09]"
              style={{ background: 'rgba(255,255,255,0.08)' }} />
            <button onClick={geocodeFrom} className="h-[40px] px-4 rounded-[12px] bg-white text-black text-[14px] font-semibold">Search</button>
          </div>
        )}

        {/* Distance */}
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-white/50 shrink-0">Distance</span>
          <input type="number" value={distanceInput} onChange={e => setDistanceInput(e.target.value)}
            min={1} max={300} step={0.5}
            className="w-[64px] h-[32px] px-2 rounded-[10px] text-white text-[15px] font-semibold text-center outline-none border border-white/[0.09]"
            style={{ background: 'rgba(255,255,255,0.08)' }} />
          <span className="text-[13px] text-white/50">km</span>
          <span className="text-[12px] text-white/25 ml-1">(recommended: {advice.targetKm} km)</span>
        </div>

        {/* Route option toggles */}
        <div className="flex flex-wrap gap-2">
          <RouteToggle active={heuvels} onToggle={() => setHeuvels(v => !v)} label="⛰️ Hills" />
          {sport === 'cycling' && (
            <>
              <RouteToggle active={groteWeg} onToggle={() => { setGroteWeg(v => !v); setMtb(false) }} label="🛣️ Main road" />
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

      {/* Actual route distance + wind */}
      {routeCoords && actualKm !== null && (
        <div className="px-4 pb-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-white/40">Route distance:</span>
            <span className="text-[15px] font-semibold text-white">{actualKm} km</span>
            <span className="text-[13px] text-white/30">· target {parsedKm()} km</span>
          </div>
          {windData && (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-white/40">Wind</span>
              <span className="text-[15px] font-semibold text-white">{windData.speedKmh} km/h</span>
              <span className="text-[13px] text-white/50">from {windData.compassLabel}</span>
              <div style={{ transform: `rotate(${(windData.directionDeg + 180) % 360}deg)` }} className="inline-flex text-white/35">
                <ArrowUp size={13} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Buttons */}
      {routeCoords && (
        <div className="px-4 pb-4 flex gap-2">
          <button onClick={retry} className="flex items-center gap-1.5 h-[40px] px-3 rounded-[12px] text-[13px] font-semibold" style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}>
            <RefreshCw size={14} />New route
          </button>
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
  // Prefer an explicit sport from the linking card; fall back to title keywords.
  // Titles like "All-out intervals" or "Threshold training" would otherwise be
  // misdetected (interval→running, threshold→other), causing the session plan to
  // disagree with the cycling/running advice card it was opened from.
  const sportParam = params.get('sport') as SportType | null
  const sport = (sportParam && ['cycling', 'running', 'strength', 'other'].includes(sportParam))
    ? sportParam
    : detectSport(title)
  const [result, setResult] = useState<ComputeAdviceResult | null>(null)
  const [recoveryPct, setRecoveryPct] = useState<number | null>(null)

  const timeLabel = time ? formatClockTime(new Date(time)) : null

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

      const [{ data: activities }, { data: settings }, { data: hevy }] = await Promise.all([
        supabase
          .from('strava_activities')
          .select('sport_type,distance,moving_time,average_speed,average_heartrate,start_date')
          .eq('user_id', user.id)
          .gte('start_date', sixtyDaysAgo)
          .order('start_date', { ascending: false }),
        supabase
          .from('user_settings')
          .select('training_intensity,age,max_hr')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('hevy_workouts')
          .select('id,title,start_time,end_time,duration,volume_kg,sets')
          .eq('user_id', user.id)
          .gte('start_time', sevenDaysAgo),
      ])

      const intensity = settings?.training_intensity ?? 'moderate'
      const maxHr = settings?.max_hr ?? (settings?.age ? Math.round(208 - 0.7 * settings.age) : null)
      const recovery = computeRecoveryDetail((activities ?? []) as any[], (hevy ?? []) as any[], maxHr)
      setRecoveryPct(recovery.pct)
      setResult(computeAdvice(sport, activities ?? [], title, intensity, recovery.pct))
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
          {result && <SportIcon sport={result.advice.sport} />}
          <div>
            <h1 className="text-[34px] font-bold text-white leading-tight">{title}</h1>
            {timeLabel && <p className="text-[15px] text-white/50">Today at {timeLabel}</p>}
          </div>
        </div>
      </div>

      {/* Recovery warning banner */}
      {recoveryPct !== null && recoveryPct < 65 && (
        <div className="mb-5 rounded-[14px] px-4 py-3 flex items-start gap-3"
          style={{ background: recoveryPct < 50 ? 'rgba(239,68,68,0.15)' : 'rgba(251,146,60,0.15)', border: `1px solid ${recoveryPct < 50 ? 'rgba(239,68,68,0.3)' : 'rgba(251,146,60,0.3)'}` }}>
          <span className="text-[18px] leading-none mt-0.5">{recoveryPct < 50 ? '🔴' : '🟠'}</span>
          <div>
            <p className="text-[14px] font-semibold text-white">{recoveryPct < 50 ? 'Low recovery — consider resting' : 'Partial recovery — take it easier'}</p>
            <p className="text-[13px] text-white/50 mt-0.5">Recovery {recoveryPct}% · Duration shortened to reflect your current fatigue</p>
          </div>
        </div>
      )}

      {!result ? (
        <div className="flex flex-col gap-4">
          {[100, 80, 80, 280].map((h, i) => (
            <div key={i} className="animate-pulse rounded-3xl" style={{ height: h, background: 'rgba(255,255,255,0.08)' }} />
          ))}
        </div>
      ) : sport === 'strength' ? (
        <Card>
          <div className="flex flex-col gap-3">
            <p className="text-[17px] font-semibold text-white">Strength training</p>
            <p className="text-white/50 text-[15px] leading-relaxed">Connect Hevy for automatic advice based on your training history.</p>
          </div>
        </Card>
      ) : sport === 'other' ? (
        <Card>
          <p className="text-white/50 text-[15px]">No specific advice available for this type of training.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Sparse-data banner: only running/cycling with < 3 matching activities */}
          {!result.isPersonalized && (
            <div
              className="px-4 py-3 rounded-[14px] flex items-start gap-3"
              style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)' }}
            >
              <span className="text-[20px]">📊</span>
              <div>
                <p className="text-[14px] font-semibold text-orange-400">Generic advice</p>
                <p className="text-[12px] text-white/50 mt-0.5">
                  Connect Strava and log at least 3 activities for personalized training advice.
                </p>
              </div>
            </div>
          )}

          {/* Row 1: training type + duration */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Type" value={TYPE_LABEL[result.advice.trainingType]} unit="" color={TYPE_COLOR[result.advice.trainingType]} />
            <MetricCard label="Duration" value={String(result.advice.durationMin)} unit="min" />
          </div>

          {/* Row 2: distance + pace/speed */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Distance" value={String(result.advice.targetKm)} unit="km" />
            {result.advice.targetPace !== null && (
              <MetricCard label="Pace" value={result.advice.targetPace} unit="/km" />
            )}
            {result.advice.targetSpeed !== null && (
              <MetricCard label="Speed" value={String(result.advice.targetSpeed)} unit="km/h" />
            )}
          </div>

          {/* Zone */}
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-semibold text-white">Heart rate zone</span>
              <span className="text-[17px] font-semibold text-teal-400">{result.advice.zone}</span>
            </div>
          </Card>

          {/* Route map */}
          <RouteMapCard advice={result.advice} title={title} sport={sport} />

          {/* Basis */}
          <p className="text-[13px] text-white/30 text-center">{result.advice.basis}</p>
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
