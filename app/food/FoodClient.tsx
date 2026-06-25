'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { ChevronRight, ChevronLeft, Plus } from 'lucide-react'
import { Card, SectionHeader, NutritionProgressBar } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import type { FoodLogEntry } from '@/lib/types'
import { fetchFoodData, fetchProducts } from './fetchers'
import type { Targets } from './fetchers'
import {
  getMealForHour, formatDayLabel,
  MEAL_ORDER, MEAL_ICONS, MEAL_LABELS, MEAL_LABELS_SHORT,
  type MacroKey,
} from './meal-config'
import { AddFoodSheet }    from './components/AddFoodSheet'
import { MacroDrillSheet } from './components/MacroDrillSheet'
import { EditFoodSheet }   from './components/EditFoodSheet'
import { MealSection }     from './components/MealSection'
import { trainingFetcher } from '@/app/training/fetcher'
import { healthFetcher } from '@/app/health/fetcher'

// Hour of day from which each meal becomes relevant (for time-aware empty meal display)
const MEAL_VISIBLE_FROM: Record<string, number> = {
  ontbijt: 6, snack_ochtend: 11, lunch: 12, snack_middag: 14,
  avondeten: 17, snack_avond: 19, supps: 0,
}

async function fetchWeeklyKcal(): Promise<Record<string, number>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const from = new Date()
  from.setDate(from.getDate() - 6)
  const { data } = await supabase
    .from('food_log').select('date,kcal')
    .eq('user_id', user.id)
    .gte('date', from.toISOString().split('T')[0])
  const map: Record<string, number> = {}
  ;(data ?? []).forEach(row => { map[row.date] = (map[row.date] ?? 0) + Number(row.kcal ?? 0) })
  return map
}

function buildCoachTip(totals: { kcal: number; protein: number }, targets: Targets, isToday: boolean): string | null {
  const kcalPct = targets.kcal > 0 ? totals.kcal / targets.kcal : 0
  const protPct  = targets.protein > 0 ? totals.protein / targets.protein : 0
  const hour = new Date().getHours()
  const protRemaining = Math.round(targets.protein - totals.protein)
  const kcalRemaining = Math.round(targets.kcal - totals.kcal)

  if (isToday && totals.kcal === 0) {
    if (hour < 10) return 'Start your day right — log your breakfast to track your macros.'
    if (hour < 14) return 'Nothing logged yet. Add your breakfast or lunch to get started.'
    return 'No food logged yet today. Start tracking to hit your goals.'
  }

  if (kcalPct > 1.15)
    return `${Math.round((kcalPct - 1) * targets.kcal)} kcal above target. Keep your last meal light.`
  if (protPct >= 1 && kcalPct <= 1.05)
    return 'Protein goal reached and calories on track. Great day so far.'
  if (protPct >= 1 && kcalPct > 1.05)
    return 'Protein goal hit, but calories are over target. Keep dinner light.'

  if (isToday) {
    if (protRemaining > 30)
      return `${protRemaining}g protein to go — prioritise a protein source in your next meal.`
    if (kcalRemaining > 500 && hour < 17)
      return `${kcalRemaining} kcal remaining. Stay consistent through the day.`
    if (hour >= 20 && kcalPct < 0.8)
      return `${kcalRemaining} kcal remaining tonight — consider a snack to close the gap.`
  } else {
    if (totals.kcal === 0) return null
    if (kcalPct >= 0.9 && kcalPct <= 1.1 && protPct >= 0.9)
      return 'On target day — calories and protein both on track.'
    if (protPct < 0.7)
      return `Protein was ${Math.round((1 - protPct) * 100)}% below target this day.`
    if (kcalPct > 1.2)
      return `Calories were ${Math.round((kcalPct - 1) * 100)}% above target this day.`
  }
  return null
}

export function FoodClient() {
  const todayStr = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const touchStartX = useRef<number | null>(null)

  const { data, mutate, error, isLoading } = useSWR(
    `food-log-${selectedDate}`,
    () => fetchFoodData(selectedDate),
    { revalidateOnFocus: true, revalidateOnMount: true, dedupingInterval: 5_000 }
  )
  const { data: products = [], isLoading: productsLoading } = useSWR('products', fetchProducts, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })
  const { data: weeklyKcal = {} } = useSWR('food-log-week', fetchWeeklyKcal, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  })

  const [showAddSheet, setShowAddSheet]       = useState(false)
  const [preselectedMeal, setPreselectedMeal] = useState(getMealForHour)
  const [macroDrill, setMacroDrill]           = useState<MacroKey | null>(null)
  const [editEntry, setEditEntry]             = useState<FoodLogEntry | null>(null)

  useEffect(() => {
    const open = showAddSheet || !!editEntry
    document.body.style.overflow = open ? 'hidden' : ''
    const nav = document.querySelector('[data-bottom-nav]') as HTMLElement | null
    if (nav) nav.style.display = open ? 'none' : ''
    return () => {
      document.body.style.overflow = ''
      const nav2 = document.querySelector('[data-bottom-nav]') as HTMLElement | null
      if (nav2) nav2.style.display = ''
    }
  }, [showAddSheet, editEntry])

  function navigate(dir: 'left' | 'right') {
    setSlideDir(dir)
    setTimeout(() => {
      setSelectedDate(d => {
        const date = new Date(d)
        date.setDate(date.getDate() + (dir === 'left' ? 1 : -1))
        return date.toISOString().split('T')[0]
      })
      setSlideDir(null)
    }, 180)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) navigate(diff > 0 ? 'left' : 'right')
    touchStartX.current = null
  }

  const log     = data?.foodLog ?? []
  const targets: Targets = data?.targets ?? { kcal: 2500, protein: 180, carbs: 250, fat: 80, goalType: 'maintain' }
  const userId  = data?.userId  ?? ''

  const totals = useMemo(() => ({
    kcal:    log.reduce((s, f) => s + Number(f.kcal    ?? 0), 0),
    protein: log.reduce((s, f) => s + Number(f.protein ?? 0), 0),
    carbs:   log.reduce((s, f) => s + Number(f.carbs   ?? 0), 0),
    fat:     log.reduce((s, f) => s + Number(f.fat     ?? 0), 0),
  }), [log])

  const { data: trainingData } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: healthRows } = useSWR('health-gezondheid', healthFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const bodyWeight = useMemo(() => {
    const row = (healthRows ?? []).find(r => r.gewicht != null)
    return row?.gewicht ?? 75
  }, [healthRows])

  const burnedKcal = useMemo(() => {
    const activities = trainingData?.activities ?? []
    const todayActivities = activities.filter(a => a.start_date.startsWith(selectedDate))
    // Deduplicate: same sport type starting within 5 minutes = same activity synced twice
    const deduped: typeof todayActivities = []
    for (const a of todayActivities) {
      const t = new Date(a.start_date).getTime()
      const isDupe = deduped.some(b =>
        b.sport_type === a.sport_type && Math.abs(new Date(b.start_date).getTime() - t) < 300_000
      )
      if (!isDupe) deduped.push(a)
    }
    const WEIGHT_KG = bodyWeight
    function metKcal(a: (typeof deduped)[0]): number {
      if (a.kilojoules && a.kilojoules > 0) return a.kilojoules
      const sport = (a.sport_type ?? '').toLowerCase()
      const hours = (a.moving_time ?? 0) / 3600
      const kmh = a.average_speed ? a.average_speed * 3.6 : 0
      let met: number
      if (sport.includes('ride') || sport.includes('cycl')) {
        if (kmh < 16) met = 4.0
        else if (kmh < 20) met = 6.0
        else if (kmh < 24) met = 8.0
        else if (kmh < 28) met = 10.0
        else if (kmh < 32) met = 12.0
        else met = 15.8
      } else if (sport.includes('run')) {
        if (kmh < 8)  met = 7.0
        else if (kmh < 10) met = 8.5
        else if (kmh < 12) met = 10.0
        else if (kmh < 14) met = 11.5
        else if (kmh < 16) met = 13.5
        else met = 16.0
      } else if (sport.includes('swim')) {
        // swimming: speed in km/h (typical pool pace 2–4 km/h)
        if (kmh < 1.8) met = 5.0
        else if (kmh < 2.8) met = 6.0
        else if (kmh < 3.5) met = 8.0
        else met = 10.0
      } else if (sport.includes('weight') || sport === 'weighttraining') {
        met = 4.0  // moderate strength training
      } else if (sport.includes('crossfit') || sport.includes('circuit')) {
        met = 7.5
      } else {
        met = 5.0  // general exercise
      }
      return met * WEIGHT_KG * hours
    }
    return Math.round(deduped.reduce((sum, a) => sum + metKcal(a), 0))
  }, [trainingData, selectedDate, bodyWeight])

  async function deleteEntry(id: string) {
    mutate(prev => prev ? { ...prev, foodLog: prev.foodLog.filter(f => f.id !== id) } : prev, false)
    const supabase = createClient()
    const { error } = await supabase.from('food_log').delete().eq('id', id)
    if (error) mutate()
  }

  function onAdded(entry: FoodLogEntry) {
    mutate(prev => prev ? { ...prev, foodLog: [...prev.foodLog, entry] } : prev, false)
    mutate()
    setShowAddSheet(false)
  }

  function onEdited(updated: FoodLogEntry) {
    mutate(prev => prev ? {
      ...prev,
      foodLog: prev.foodLog.map(f => f.id === updated.id ? updated : f),
    } : prev, false)
    setEditEntry(null)
  }

  const mealMap = useMemo(() => {
    const map: Record<string, FoodLogEntry[]> = {}
    MEAL_ORDER.forEach(m => { map[m] = [] })
    log.forEach(f => {
      const key = f.meal_category
      if (!map[key]) map[key] = []
      map[key].push(f)
    })
    return map
  }, [log])

  const isToday = selectedDate === todayStr
  const currentHour = new Date().getHours()
  const coachTip = buildCoachTip(totals, targets, isToday)
  const proteinHit = totals.protein >= targets.protein

  // For today: show time-relevant meals + any with entries; for other days: entries only
  const visibleMeals = isToday
    ? MEAL_ORDER.filter(meal =>
        (mealMap[meal] ?? []).length > 0 || currentHour >= (MEAL_VISIBLE_FROM[meal] ?? 0)
      )
    : MEAL_ORDER.filter(meal => (mealMap[meal] ?? []).length > 0)

  // Last 7 days anchored to today for the adherence strip
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStr)
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().split('T')[0]
  })

  const currentMealLabel = MEAL_LABELS_SHORT[getMealForHour()] ?? 'Food'

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <p className="text-white/40 text-[15px] text-center">Kon data niet laden</p>
        <p className="text-white/20 text-[12px] text-center">{String(error)}</p>
        <button onClick={() => mutate()} className="text-teal-400 text-[15px] font-medium">
          Opnieuw proberen
        </button>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4">
        {[180, 90, 56, 56, 56].map((h, i) => (
          <div key={i} className="animate-pulse rounded-3xl"
            style={{ height: h, background: 'rgba(255,255,255,0.10)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[22px]" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('right')}
          className="w-9 h-9 flex items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={18} className="text-white/70" />
        </button>
        <span className="text-[17px] font-semibold text-white">{formatDayLabel(selectedDate)}</span>
        <button onClick={() => navigate('left')}
          className="w-9 h-9 flex items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronRight size={18} className="text-white/70" />
        </button>
      </div>

      {/* 7-day adherence strip — teal dot = on target, orange = tracked but off, dim = empty */}
      <div className="flex justify-between">
        {last7.map(day => {
          const kcalForDay = weeklyKcal[day] ?? 0
          const pct = targets.kcal > 0 ? kcalForDay / targets.kcal : 0
          const isSelected = day === selectedDate
          const dotColor = kcalForDay === 0
            ? 'rgba(255,255,255,0.12)'
            : targets.goalType === 'cut'
              ? pct < 1.00 ? '#4ade80'            // under goal = green (deficit achieved)
              : pct < 1.20 ? '#fb923c'            // just over goal = orange
              : '#f87171'                          // far over goal = red
            : targets.goalType === 'bulk'
              ? pct >= 1.00 ? '#4ade80'           // at/over goal = green (surplus achieved)
              : pct >= 0.80 ? '#fb923c'           // close but under = orange
              : '#f87171'                          // far under goal = red
            : pct >= 0.85 && pct <= 1.15 ? 'rgb(45,212,191)'  // maintain: on target = teal
            : pct >= 0.60 ? '#fb923c'
            : '#f87171'
          const d = new Date(day + 'T12:00:00')
          const dayLetter = d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0)
          const dayNum = d.getDate()
          return (
            <button
              key={day}
              onClick={() => setSelectedDate(day)}
              className="flex flex-col items-center gap-1 flex-1"
            >
              <span className="text-[10px] font-medium"
                style={{ color: isSelected ? 'white' : 'rgba(255,255,255,0.3)' }}>
                {dayLetter}
              </span>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold"
                style={isSelected
                  ? { background: 'white', color: 'black' }
                  : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
              >
                {dayNum}
              </div>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
            </button>
          )
        })}
      </div>

      <div
        key={selectedDate}
        style={{
          animation: slideDir === 'left'
            ? 'slideOutLeft 180ms ease-in forwards'
            : slideDir === 'right'
            ? 'slideOutRight 180ms ease-in forwards'
            : 'slideIn 220ms ease-out',
        }}
        className="flex flex-col gap-[22px]"
      >
        {/* Coach tip */}
        {coachTip && (
          <p className="text-[15px] font-medium text-white/50 leading-snug px-1">{coachTip}</p>
        )}

        {/* Macros card */}
        <Card>
          <div className="flex flex-col gap-[18px]">
            <div className="flex items-start justify-between">
              <SectionHeader title="Macros" />
              <div className="text-right">
                <p className="text-[13px] font-semibold text-white">
                  {Math.round(totals.kcal).toLocaleString('nl-NL')} / {targets.kcal.toLocaleString('nl-NL')}
                  {burnedKcal > 0 && (
                    <span className="text-orange-400"> +{burnedKcal.toLocaleString('nl-NL')}</span>
                  )}
                  {' '}kcal
                </p>
                <p className="text-[12px] mt-0.5 font-medium"
                  style={{ color: proteinHit ? 'rgb(45,212,191)' : 'rgba(255,255,255,0.4)' }}>
                  {Math.round(totals.protein)}g / {targets.protein}g protein{proteinHit ? ' ✓' : ''}
                </p>
              </div>
            </div>
            {([
              { key: 'kcal'    as const, label: 'Calories',    unit: 'kcal', tint: 'bg-orange-400' },
              { key: 'protein' as const, label: 'Protein',        unit: 'g',    tint: 'bg-teal-400'   },
              { key: 'carbs'   as const, label: 'Carbs', unit: 'g',    tint: 'bg-yellow-400' },
              { key: 'fat'     as const, label: 'Fat',          unit: 'g',    tint: 'bg-indigo-400' },
            ]).map(({ key, label, unit, tint }) => (
              <button key={key}
                className="w-full text-left active:opacity-60 transition-opacity"
                onClick={() => setMacroDrill(key)}>
                <NutritionProgressBar
                  label={label} current={totals[key]} target={targets[key]} unit={unit} tint={tint} />
              </button>
            ))}
          </div>
        </Card>

        {/* Meals */}
        <div className="flex flex-col gap-3.5">
          <SectionHeader title="Today's Meals" />

          {visibleMeals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 rounded-[18px] border border-white/[0.055]"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-white/30 text-[15px]">No meals logged</p>
              <p className="text-white/20 text-[13px]">Navigate to another day or add an entry</p>
            </div>
          ) : visibleMeals.map(meal => (
            <MealSection
              key={meal}
              meal={meal}
              icon={MEAL_ICONS[meal] ?? '🍽️'}
              label={MEAL_LABELS[meal] ?? meal}
              entries={mealMap[meal] ?? []}
              onDelete={deleteEntry}
              onEdit={setEditEntry}
              onAdd={() => { setPreselectedMeal(meal); setShowAddSheet(true) }}
            />
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(var(--slide-from, 40px)); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideOutLeft {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(-40px); }
        }
        @keyframes slideOutRight {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(40px); }
        }
      `}</style>

      {/* FAB — pill with meal label on today, plain circle on other days */}
      {isToday ? (
        <button
          onClick={() => { setPreselectedMeal(getMealForHour()); setShowAddSheet(true) }}
          className="fixed bottom-[108px] right-5 z-40 h-[44px] px-4 rounded-full flex items-center gap-2 border border-white/20 shadow-xl"
          style={{ background: 'rgba(255,255,255,0.12)' }}
          aria-label="Add food"
        >
          <Plus size={17} className="text-white" strokeWidth={2.3} />
          <span className="text-[14px] font-semibold text-white">{currentMealLabel}</span>
        </button>
      ) : (
        <button
          onClick={() => { setPreselectedMeal(getMealForHour()); setShowAddSheet(true) }}
          className="fixed bottom-[108px] right-5 z-40 w-[56px] h-[56px] rounded-full flex items-center justify-center border border-white/20 shadow-xl"
          style={{ background: 'rgba(255,255,255,0.12)' }}
          aria-label="Add food"
        >
          <Plus size={24} className="text-white" strokeWidth={2.2} />
        </button>
      )}

      {showAddSheet && (
        <AddFoodSheet
          products={products}
          productsLoading={productsLoading}
          preselectedMeal={preselectedMeal}
          userId={userId}
          today={selectedDate}
          totals={totals}
          targets={targets}
          onAdded={onAdded}
          onClose={() => setShowAddSheet(false)}
        />
      )}

      {macroDrill && (
        <MacroDrillSheet macro={macroDrill} log={log} onClose={() => setMacroDrill(null)} />
      )}

      {editEntry && (
        <EditFoodSheet
          entry={editEntry}
          userId={userId}
          onSaved={onEdited}
          onClose={() => setEditEntry(null)}
        />
      )}
    </div>
  )
}
