'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, Bike, PersonStanding, Dumbbell } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Card } from '@/components/ui'

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
  targetPace: string | null   // running: min/km
  targetSpeed: number | null  // cycling: km/h
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
