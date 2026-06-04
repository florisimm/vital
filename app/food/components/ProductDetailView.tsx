'use client'

import { useState } from 'react'
import { MEAL_ORDER, MEAL_ICONS, MEAL_LABELS_SHORT } from '@/app/food/meal-config'
import { createClient } from '@/lib/supabase'
import type { FoodLogEntry, Product } from '@/lib/types'
import type { Targets } from '@/app/food/fetchers'

export function ProductDetailView({ selected, meal, setMeal, userId, today, totals, targets, trainingCache, healthCache, onAdded }: {
  selected: Product
  meal: string
  setMeal: (m: string) => void
  userId: string
  today: string
  totals: { kcal: number; protein: number; carbs: number; fat: number }
  targets: Targets
  trainingCache: any
  healthCache: any[]
  onAdded: (e: FoodLogEntry) => void
}) {
  const servings = selected.servings ?? []
  const GRAM_SERVING = { label: 'gram / ml', amount_g: 1 }

  const [grams, setGrams] = useState(() =>
    servings[0] ? String(servings[0].amount_g) : '100'
  )
  const [selectedServing, setSelectedServing] = useState<{ label: string; amount_g: number } | null>(
    () => servings[0] ?? null
  )
  const [servingMultiplier, setServingMultiplier] = useState('1')
  const [saving, setSaving] = useState(false)

  const active = selectedServing ?? servings[0] ?? GRAM_SERVING
  const stepAmt = active.amount_g > 1 ? active.amount_g : 10
  const g = Math.max(0, Number(grams) || 0)

  const preview = g > 0 ? {
    kcal:    (Number(selected.kcal    ?? 0) * g) / 100,
    protein: (Number(selected.protein ?? 0) * g) / 100,
    carbs:   (Number(selected.carbs   ?? 0) * g) / 100,
    fat:     (Number(selected.fat     ?? 0) * g) / 100,
  } : null

  function pickPill(s: { label: string; amount_g: number }) {
    setSelectedServing(s)
    setGrams(String(s.amount_g))
    setServingMultiplier('1')
  }

  function applyStep(dir: 1 | -1) {
    setGrams(prev => {
      const n = Math.max(stepAmt, (Number(prev) || 0) + dir * stepAmt)
      setServingMultiplier(String(Math.round(n / active.amount_g)))
      return String(n)
    })
  }

  const repeatRef = { current: null as ReturnType<typeof setInterval> | null }
  function startRepeat(dir: 1 | -1) {
    applyStep(dir)
    repeatRef.current = setInterval(() => applyStep(dir), 110)
  }
  function stopRepeat() {
    if (repeatRef.current) { clearInterval(repeatRef.current); repeatRef.current = null }
  }

  const servingPills = [
    ...servings,
    ...[50, 100, 150, 200]
      .filter(v => !servings.some(s => s.amount_g === v))
      .map(v => ({ label: `${v}g`, amount_g: v })),
    GRAM_SERVING,
  ]

  async function handleSave() {
    if (!preview) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('food_log').insert({
      user_id: userId, date: today, meal_category: meal,
      food_name: selected.name, amount_g: Number(grams),
      kcal:    Math.round(preview.kcal),
      protein: Math.round(preview.protein * 10) / 10,
      carbs:   Math.round(preview.carbs   * 10) / 10,
      fat:     Math.round(preview.fat     * 10) / 10,
      sugars: 0, brand: selected.brand ?? '',
    }).select('id,meal_category,food_name,amount_g,kcal,protein,carbs,fat,logged_at').single()
    setSaving(false)
    if (!error && data) onAdded(data as FoodLogEntry)
  }

  // ── Daily impact ──────────────────────────────────────────────────────────────

  const afterKcal    = totals.kcal    + (preview?.kcal    ?? 0)
  const afterProtein = totals.protein + (preview?.protein ?? 0)
  const afterCarbs   = totals.carbs   + (preview?.carbs   ?? 0)
  const afterFat     = totals.fat     + (preview?.fat     ?? 0)
  const kcalPct      = Math.round(Math.min(afterKcal / targets.kcal * 100, 999))

  // ── Activity equivalents ──────────────────────────────────────────────────────

  const bodyWeight = (() => {
    const row = (healthCache ?? []).find((r: any) => r.gewicht)
    return row ? Number(row.gewicht) : 75
  })()
  const allActs: any[] = (trainingCache as any)?.activities ?? []
  const runs  = allActs.filter(a => a.sport_type?.toLowerCase().includes('run')  && (a.average_speed ?? 0) > 0)
  const rides = allActs.filter(a => (a.sport_type?.toLowerCase().includes('ride') || a.sport_type?.toLowerCase().includes('cycl')) && (a.average_speed ?? 0) > 0)
  const runCount  = allActs.filter(a => a.sport_type?.toLowerCase().includes('run')).length
  const rideCount = allActs.filter(a => a.sport_type?.toLowerCase().includes('ride') || a.sport_type?.toLowerCase().includes('cycl')).length
  const runMet = runs.length
    ? (() => { const kmh = runs.reduce((s: number, a: any) => s + a.average_speed, 0) / runs.length * 3.6; return Math.max(7, Math.min(15, kmh * 0.75 + 3.5)) })()
    : 10
  const rideMet = rides.length
    ? (() => { const kmh = rides.reduce((s: number, a: any) => s + a.average_speed * 3.6, 0) / rides.length; return kmh < 18 ? 5.5 : kmh < 24 ? 7.5 : kmh < 30 ? 9.5 : 11.5 })()
    : 7.5
  const burnMin = (met: number, kcal: number) => Math.max(1, Math.round(kcal * 60 / (met * bodyWeight)))
  const actItems = (() => {
    const kcal = preview?.kcal ?? 0
    if (kcal <= 5) return []
    const walk = { emoji: '🚶', label: 'walking',  min: burnMin(3.5,     kcal) }
    const run  = { emoji: '🏃', label: 'running',  min: burnMin(runMet,  kcal) }
    const ride = { emoji: '🚴', label: 'cycling',  min: burnMin(rideMet, kcal) }
    if (runCount === 0 && rideCount === 0) return [walk]
    const userActs = ([
      runCount  > 0 ? { ...run,  cnt: runCount  } : null,
      rideCount > 0 ? { ...ride, cnt: rideCount } : null,
    ].filter(Boolean) as any[]).sort((a, b) => b.cnt - a.cnt).slice(0, 2)
    return [...userActs, walk]
  })()
  const isPersonalized = runs.length > 0 || rides.length > 0

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 pt-1 pb-4" style={{ overscrollBehavior: 'contain' }}>

        <div className="px-5">
          <p className="text-[26px] font-bold text-white leading-tight">{selected.name.charAt(0).toUpperCase() + selected.name.slice(1)}</p>
          <p className="text-[13px] text-white/40 mt-0.5">
            {[selected.brand, `${Number(selected.kcal ?? 0)} kcal / 100g`].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="px-5">
          <div className="flex items-center justify-between px-3 py-2 rounded-[18px]"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <button
              onPointerDown={() => startRepeat(-1)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat}
              className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[30px] font-light text-white select-none"
              style={{ background: 'rgba(255,255,255,0.10)' }}>−</button>
            <div className="flex flex-col items-center">
              <div className="flex items-baseline gap-1">
                <input type="number" inputMode="decimal" value={grams}
                  onChange={e => { setGrams(e.target.value); setServingMultiplier(String(Math.round(Number(e.target.value) / active.amount_g))) }}
                  className="text-[52px] font-bold text-white bg-transparent text-center outline-none w-32" />
                <span className="text-[18px] text-white/50">g</span>
              </div>
              {active.amount_g > 1 && g > 0 && (
                <span className="text-[12px] text-white/30 -mt-1">{(g / active.amount_g).toFixed(1)} × {active.label}</span>
              )}
            </div>
            <button
              onPointerDown={() => startRepeat(1)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat}
              className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[30px] font-light text-white select-none"
              style={{ background: 'rgba(255,255,255,0.10)' }}>+</button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto px-5" style={{ scrollbarWidth: 'none' }}>
          {servingPills.map((s, i) => (
            <button key={i} onClick={() => pickPill(s)}
              className="shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap"
              style={active.label === s.label
                ? { background: 'white', color: 'black' }
                : { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.65)' }}>
              {s.label}
            </button>
          ))}
        </div>

        {preview && (
          <div className="mx-5 rounded-[20px] p-4 flex flex-col gap-3"
            style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="flex items-end justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-[40px] font-bold text-white leading-none">{Math.round(afterKcal)}</span>
                <span className="text-[15px] text-white/45">kcal</span>
              </div>
              <div className="flex items-center gap-1.5 pb-1">
                <span className="text-[13px] text-white/30">{Math.round(totals.kcal)} →</span>
                <span className="text-[13px] font-semibold text-orange-400">+{Math.round(preview.kcal)}</span>
                <span className="text-[13px] text-white/30">· {kcalPct}%</span>
              </div>
            </div>
            <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-150 bg-orange-400"
                style={{ width: `${Math.min(afterKcal / targets.kcal * 100, 100)}%` }} />
            </div>
            {([
              { label: 'Protein', after: afterProtein, delta: preview.protein, target: targets.protein, color: '#2dd4bf' },
              { label: 'Carbs',   after: afterCarbs,   delta: preview.carbs,   target: targets.carbs,   color: '#facc15' },
              { label: 'Fat',     after: afterFat,     delta: preview.fat,     target: targets.fat,     color: '#818cf8' },
            ] as const).map(({ label, after, delta, target, color }) => {
              const pct = Math.round(Math.min(after / target * 100, 999))
              const rem = Math.max(0, Math.round(target - after))
              return (
                <div key={label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-white/45 uppercase tracking-wide">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold" style={{ color }}>+{delta.toFixed(1)}g</span>
                      <span className="text-[12px] text-white/30">{pct}% · {rem > 0 ? `${rem}g left` : 'done ✓'}</span>
                    </div>
                  </div>
                  <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all duration-150"
                      style={{ width: `${Math.min(after / target * 100, 100)}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {actItems.length > 0 && (
          <div className="mx-5 rounded-[20px] px-5 py-4 flex flex-col items-center gap-3"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-[12px] font-semibold text-white/40 uppercase tracking-[0.12em]">🔥 Activity Equivalent</span>
            <div className="flex items-center justify-center gap-5">
              {actItems.map((a: any, i: number) => (
                <span key={i} className="flex items-center gap-5">
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-[22px] leading-none">{a.emoji}</span>
                    <span className="text-[16px] font-bold text-white leading-none">{a.min} min</span>
                    <span className="text-[11px] text-white/35 leading-none">{a.label}</span>
                  </span>
                  {i < actItems.length - 1 && <span className="text-white/15 text-[18px] font-light">·</span>}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-white/25 text-center leading-relaxed">
              {isPersonalized ? 'Based on your weight & activity profile' : 'General estimate · connect Strava to personalise'}
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-3 px-5 pt-3 pb-6"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {servingPills.map((s, i) => (
            <button key={i} onClick={() => pickPill(s)}
              className="shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap"
              style={active.label === s.label
                ? { background: 'white', color: 'black' }
                : { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.65)' }}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {MEAL_ORDER.map(m => (
            <button key={m} onClick={() => setMeal(m)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap"
              style={meal === m
                ? { background: 'white', color: 'black' }
                : { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.65)' }}>
              <span>{MEAL_ICONS[m]}</span>
              <span>{MEAL_LABELS_SHORT[m]}</span>
            </button>
          ))}
        </div>
        <button onClick={handleSave} disabled={saving || !preview}
          className="w-full h-[56px] rounded-[18px] bg-white text-black font-bold text-[17px] disabled:opacity-40">
          {saving ? '…' : `Log · ${MEAL_LABELS_SHORT[meal] ?? meal}`}
        </button>
      </div>
    </div>
  )
}
