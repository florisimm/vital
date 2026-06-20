'use client'

import { useState, useRef, useEffect } from 'react'
import { MEAL_ORDER, MEAL_ICONS, MEAL_LABELS_SHORT } from '@/app/food/meal-config'
import { createClient } from '@/lib/supabase'
import type { FoodLogEntry, Product } from '@/lib/types'
import type { Targets } from '@/app/food/fetchers'

// ─── Macro tile ───────────────────────────────────────────────────────────────
function MacroTile({ icon, label, value, unit, color, pct }: {
  icon: string; label: string; value: string; unit: string; color: string; pct?: number
}) {
  return (
    <div className="flex-1 flex flex-col gap-2 px-3 py-3 rounded-[14px]"
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-1">
        <span className="text-[11px] leading-none">{icon}</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.06em]" style={{ color }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-[22px] font-bold text-white leading-none">{value}</span>
        <span className="text-[9.5px] text-white/35 leading-none">{unit}</span>
      </div>
      <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: color, opacity: pct ? 1 : 0.25 }} />
      </div>
    </div>
  )
}

// ─── Dropdown row ─────────────────────────────────────────────────────────────
function SelectorRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3 py-2 rounded-[14px] text-left"
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold text-white/35 uppercase tracking-[0.07em]">{label}</span>
        <span className="text-[14px] font-semibold text-white">{value}</span>
      </div>
      <span className="text-white/30 text-[12px]">▼</span>
    </button>
  )
}

// ─── Macro progress row ───────────────────────────────────────────────────────
function MacroProgressRow({ label, color, after, delta, target }: {
  label: string; color: string; after: number; delta: number; target: number
}) {
  const pct = Math.min(after / target * 100, 100)
  const rem = Math.max(0, target - after)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-white/60">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold" style={{ color }}>+{delta.toFixed(1)}g</span>
          <span className="text-[11px] text-white/30">{after.toFixed(0)} / {target}g</span>
          <span className="text-[10px]" style={{ color: rem > 0 ? 'rgba(255,255,255,0.2)' : '#2dd4bf' }}>
            {rem > 0 ? `${rem.toFixed(0)} left` : '✓'}
          </span>
        </div>
      </div>
      <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─── Activity card ────────────────────────────────────────────────────────────
function ActivityCard({ emoji, label, min }: { emoji: string; label: string; min: number }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-[12px]"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="text-[18px] leading-none">{emoji}</span>
      <span className="text-[15px] font-bold text-white leading-none">{min}</span>
      <span className="text-[9px] text-white/35 leading-none">min {label}</span>
    </div>
  )
}

// ─── Sheets ───────────────────────────────────────────────────────────────────
const SHEET_STYLE = `
  @keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
  @keyframes fadeIn  { from { opacity: 0 }                  to { opacity: 1 } }
`

function ServingSheet({ servingPills, active, onPick, onClose }: {
  servingPills: { label: string; amount_g: number }[]
  active: { label: string; amount_g: number }
  onPick: (s: { label: string; amount_g: number }) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)', animation: 'fadeIn 0.2s ease' }} onClick={onClose}>
      <style>{SHEET_STYLE}</style>
      <div className="rounded-t-[24px] flex flex-col pb-8"
        style={{ background: 'rgb(18,19,22)', animation: 'sheetUp 0.32s cubic-bezier(0.32,0.72,0,1)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <span className="text-[17px] font-semibold text-white">Serving size</span>
          <button onClick={onClose} className="text-white/50 text-[15px] font-semibold px-3 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)' }}>Close</button>
        </div>
        <div className="flex flex-col">
          {servingPills.map((s, i) => (
            <button key={i} onClick={() => onPick(s)}
              className="flex items-center justify-between px-5 py-4 text-left"
              style={{ background: active.label === s.label ? 'rgba(45,212,191,0.08)' : 'transparent' }}>
              <span className="text-[16px] text-white">{s.label}</span>
              {active.label === s.label && <span className="text-teal-400 text-[14px] font-semibold">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MealSheet({ meal, setMeal, onClose }: { meal: string; setMeal: (m: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)', animation: 'fadeIn 0.2s ease' }} onClick={onClose}>
      <style>{SHEET_STYLE}</style>
      <div className="rounded-t-[24px] flex flex-col pb-8"
        style={{ background: 'rgb(18,19,22)', animation: 'sheetUp 0.32s cubic-bezier(0.32,0.72,0,1)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <span className="text-[17px] font-semibold text-white">Meal</span>
          <button onClick={onClose} className="text-white/50 text-[15px] font-semibold px-3 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)' }}>Close</button>
        </div>
        <div className="flex flex-col">
          {MEAL_ORDER.map(m => (
            <button key={m} onClick={() => { setMeal(m); onClose() }}
              className="flex items-center gap-3 px-5 py-4 text-left"
              style={{ background: meal === m ? 'rgba(45,212,191,0.08)' : 'transparent' }}>
              <span className="text-[20px]">{MEAL_ICONS[m]}</span>
              <span className="text-[16px] text-white">{MEAL_LABELS_SHORT[m]}</span>
              {meal === m && <span className="ml-auto text-teal-400 text-[14px] font-semibold">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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
  const servingPills = [...servings, GRAM_SERVING]

  const [grams, setGrams] = useState(() => servings[0] ? String(servings[0].amount_g) : '100')
  const [selectedServing, setSelectedServing] = useState<{ label: string; amount_g: number } | null>(() => servings[0] ?? null)
  const [showServings, setShowServings] = useState(false)
  const [showMeals, setShowMeals] = useState(false)
  const [showImpact, setShowImpact] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [portionInput, setPortionInput] = useState<string | null>(null)
  const [avgGrams, setAvgGrams] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchAvg() {
      const supabase = createClient()
      const { data } = await supabase
        .from('food_log')
        .select('amount_g')
        .eq('user_id', userId)
        .eq('food_name', selected.name)
        .not('amount_g', 'is', null)
        .order('logged_at', { ascending: false })
        .limit(30)
      if (cancelled || !data || data.length < 2) return
      const avg = Math.round(data.reduce((s: number, r: any) => s + Number(r.amount_g), 0) / data.length)
      if (avg > 0) setAvgGrams(avg)
    }
    fetchAvg()
    return () => { cancelled = true }
  }, [selected.name, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = selectedServing ?? servings[0] ?? GRAM_SERVING
  const stepAmt = active.amount_g > 1 ? active.amount_g : 10
  const g = Math.max(0, Number(grams) || 0)

  const per100 = {
    kcal:    Number(selected.kcal    ?? 0),
    protein: Number(selected.protein ?? 0),
    carbs:   Number(selected.carbs   ?? 0),
    fat:     Number(selected.fat     ?? 0),
  }
  const preview = g > 0 ? {
    kcal:    per100.kcal    * g / 100,
    protein: per100.protein * g / 100,
    carbs:   per100.carbs   * g / 100,
    fat:     per100.fat     * g / 100,
  } : null

  function pickServing(s: { label: string; amount_g: number }) {
    setSelectedServing(s)
    if (s.label !== GRAM_SERVING.label) setGrams(String(s.amount_g))
    setPortionInput(null)
    setShowServings(false)
  }
  function applyStep(dir: 1 | -1) {
    setPortionInput(null)
    setGrams(prev => String(Math.max(stepAmt, (Number(prev) || 0) + dir * stepAmt)))
  }
  function startRepeat(dir: 1 | -1) { applyStep(dir); repeatRef.current = setInterval(() => applyStep(dir), 110) }
  function stopRepeat() { if (repeatRef.current) { clearInterval(repeatRef.current); repeatRef.current = null } }

  async function handleSave() {
    if (!preview) return
    setSaving(true)
    const supabase = createClient()

    const [{ data, error }] = await Promise.all([
      supabase.from('food_log').insert({
        user_id: userId, date: today, meal_category: meal,
        food_name: selected.name, amount_g: Number(grams),
        kcal: Math.round(preview.kcal),
        protein: Math.round(preview.protein * 10) / 10,
        carbs:   Math.round(preview.carbs   * 10) / 10,
        fat:     Math.round(preview.fat     * 10) / 10,
        sugars: 0, brand: selected.brand ?? '',
      }).select('id,meal_category,food_name,amount_g,kcal,protein,carbs,fat,logged_at').single(),

      // Save product to personal library (macros per 100g + servings)
      supabase.from('products').upsert(
        {
          user_id:   userId,
          name:      selected.name,
          brand:     selected.brand  ?? null,
          kcal:      per100.kcal,
          protein:   per100.protein,
          carbs:     per100.carbs,
          fat:       per100.fat,
          servings:  selected.servings  ?? null,
          image_url: selected.image_url ?? null,
          barcode:   selected.barcode   ?? null,
        },
        { onConflict: 'user_id,name' },
      ),
    ])

    setSaving(false)
    if (!error && data) onAdded(data as FoodLogEntry)
  }

  // Daily impact
  const afterKcal    = totals.kcal    + (preview?.kcal    ?? 0)
  const afterProtein = totals.protein + (preview?.protein ?? 0)
  const afterCarbs   = totals.carbs   + (preview?.carbs   ?? 0)
  const afterFat     = totals.fat     + (preview?.fat     ?? 0)
  const kcalPct      = Math.round(Math.min(afterKcal / targets.kcal * 100, 999))
  const kcalBarPct   = Math.min(afterKcal / targets.kcal * 100, 100)

  // Activity equivalents
  const bodyWeight = (() => { const r = (healthCache ?? []).find((r: any) => r.gewicht); return r ? Number(r.gewicht) : 75 })()
  const allActs: any[] = (trainingCache as any)?.activities ?? []
  const runs  = allActs.filter(a => a.sport_type?.toLowerCase().includes('run')  && (a.average_speed ?? 0) > 0)
  const rides = allActs.filter(a => (a.sport_type?.toLowerCase().includes('ride') || a.sport_type?.toLowerCase().includes('cycl')) && (a.average_speed ?? 0) > 0)
  const runCount  = allActs.filter(a => a.sport_type?.toLowerCase().includes('run')).length
  const rideCount = allActs.filter(a => a.sport_type?.toLowerCase().includes('ride') || a.sport_type?.toLowerCase().includes('cycl')).length
  const runMet  = runs.length  ? (() => { const k = runs.reduce((s: number,a: any) => s + a.average_speed,0) / runs.length * 3.6; return Math.max(7,Math.min(15,k*0.75+3.5)) })() : 10
  const rideMet = rides.length ? (() => { const k = rides.reduce((s: number,a: any) => s + a.average_speed*3.6,0) / rides.length; return k<18?5.5:k<24?7.5:k<30?9.5:11.5 })() : 7.5
  const burnMin = (met: number, kcal: number) => Math.max(1, Math.round(kcal * 60 / (met * bodyWeight)))
  const actItems = (() => {
    const kcal = preview?.kcal ?? 0; if (kcal <= 5) return []
    const items: { emoji: string; label: string; min: number }[] = [{ emoji: '🚶', label: 'walk', min: burnMin(3.5, kcal) }]
    if (runCount > 0)  items.unshift({ emoji: '🏃', label: 'run',  min: burnMin(runMet,  kcal) })
    if (rideCount > 0) items.splice(runCount > 0 ? 1 : 0, 0, { emoji: '🚴', label: 'ride', min: burnMin(rideMet, kcal) })
    return items.slice(0, 3)
  })()

  return (
    <>
      {showServings && <ServingSheet servingPills={servingPills} active={active} onPick={pickServing} onClose={() => setShowServings(false)} />}
      {showMeals    && <MealSheet meal={meal} setMeal={setMeal} onClose={() => setShowMeals(false)} />}

      <div className="flex flex-col flex-1 min-h-0">

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          <div className="max-w-md mx-auto px-4 pt-2 pb-3 flex flex-col gap-2.5">

            {/* Product name */}
            <div>
              <p className="text-[23px] font-bold text-white leading-tight">
                {selected.name.charAt(0).toUpperCase() + selected.name.slice(1)}
              </p>
              <p className="text-[12px] text-white/35 mt-0.5">
                {[selected.brand, `${per100.kcal} kcal / 100g`].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* 4 macro tiles with subtle progress indicators */}
            <div className="flex gap-1.5">
              <MacroTile icon="🔥" label="Energy"  color="#fb923c"
                value={preview ? String(Math.round(preview.kcal)) : String(per100.kcal)} unit="kcal"
                pct={preview ? preview.kcal / targets.kcal * 100 : undefined} />
              <MacroTile icon="💪" label="Protein" color="#2dd4bf"
                value={preview ? preview.protein.toFixed(1) : String(per100.protein)} unit="g"
                pct={preview ? preview.protein / targets.protein * 100 : undefined} />
              <MacroTile icon="🌾" label="Carbs"   color="#facc15"
                value={preview ? preview.carbs.toFixed(1) : String(per100.carbs)} unit="g"
                pct={preview ? preview.carbs / targets.carbs * 100 : undefined} />
              <MacroTile icon="🫙" label="Fat"     color="#818cf8"
                value={preview ? preview.fat.toFixed(1) : String(per100.fat)} unit="g"
                pct={preview ? preview.fat / targets.fat * 100 : undefined} />
            </div>

            {/* Quantity + Serving selector */}
            <div className="flex gap-2 items-stretch">
              <div className="flex-[1] flex items-center justify-center px-3 py-2.5 rounded-[14px] cursor-text"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)' }}
                onClick={() => inputRef.current?.focus()}>
                <div className="flex items-baseline gap-0">
                  {active.amount_g > 1 ? (
                    <input ref={inputRef} type="text" inputMode="decimal"
                      value={portionInput !== null ? portionInput : (g > 0 ? String(Math.round(g / active.amount_g * 10) / 10) : '')}
                      size={Math.max(1, (portionInput !== null ? portionInput : String(Math.round(g / active.amount_g * 10) / 10)).length)}
                      onChange={e => { const v = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(v)) { setPortionInput(v); const n = parseFloat(v); if (!isNaN(n)) setGrams(String(n * active.amount_g)) } }}
                      onFocus={() => { setInputFocused(true); setPortionInput(String(Math.round(g / active.amount_g * 10) / 10)) }}
                      onBlur={() => { setInputFocused(false); setPortionInput(null) }}
                      className="text-[18px] font-bold text-white bg-transparent outline-none" />
                  ) : (
                    <input ref={inputRef} type="text" inputMode="decimal" value={grams}
                      size={Math.max(1, grams.length)}
                      onChange={e => { const v = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(v)) setGrams(v) }}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      className="text-[18px] font-bold text-white bg-transparent outline-none" />
                  )}
                  {!inputFocused && active.amount_g > 1 && (
                    <span className="text-[12px] text-white/40">×</span>
                  )}
                </div>
              </div>
              <button onClick={() => setShowServings(true)}
                className="flex-[3] flex flex-row items-center justify-between px-3 py-2.5 rounded-[14px]"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-[14px] font-semibold text-white leading-tight truncate min-w-0">{active.label}</span>
                <span className="text-[11px] text-white/30 shrink-0 ml-2">▼</span>
              </button>
            </div>

            {/* Average portion chip */}
            {avgGrams !== null && (
              <button
                onClick={() => { setSelectedServing(GRAM_SERVING); setGrams(String(avgGrams)); setPortionInput(null) }}
                className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold active:opacity-70 transition-opacity"
                style={{ background: 'rgba(45,212,191,0.10)', color: 'rgb(45,212,191)', border: '1px solid rgba(45,212,191,0.18)' }}
              >
                <span>⌀</span>
                <span>Gemiddelde · {avgGrams}g</span>
              </button>
            )}

            {/* Meal selector */}
            <SelectorRow
              label="Logged as"
              value={`${MEAL_ICONS[meal]} ${MEAL_LABELS_SHORT[meal] ?? meal}`}
              onClick={() => setShowMeals(true)}
            />

            {/* Daily impact — calorie bar always visible, macros expandable */}
            {preview && (
              <div className="rounded-[16px] overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)' }}>

                {/* Always-visible calorie progress strip */}
                <div className="h-[3px] w-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full transition-all duration-300"
                    style={{
                      width: `${kcalBarPct}%`,
                      background: 'linear-gradient(90deg,#fb923c,#f97316)',
                      borderRadius: kcalBarPct < 99 ? '0 2px 2px 0' : '0',
                    }} />
                </div>

                <button className="w-full flex items-center justify-between px-4 py-3"
                  onClick={() => setShowImpact(o => !o)}>
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="text-[10px] font-semibold text-white/35 uppercase tracking-[0.07em]">Daily impact</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[20px] font-bold text-white">{Math.round(afterKcal)}</span>
                      <span className="text-[12px] text-white/35">kcal</span>
                    </div>
                    <span className="text-[11px]" style={{ color: kcalPct > 100 ? 'rgba(249,115,22,0.7)' : 'rgba(255,255,255,0.28)' }}>
                      {kcalPct}% of daily goal
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]" style={{ color: 'rgba(251,146,60,0.55)' }}>+{Math.round(preview.kcal)}</span>
                    <span className="text-white/25 text-[11px]">{showImpact ? '▲' : '▼'}</span>
                  </div>
                </button>

                {showImpact && (
                  <div className="px-4 pb-3.5 flex flex-col gap-2.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="mt-3 flex flex-col gap-2.5">
                      <MacroProgressRow label="Protein" color="#2dd4bf" after={afterProtein} delta={preview.protein} target={targets.protein} />
                      <MacroProgressRow label="Carbs"   color="#facc15" after={afterCarbs}   delta={preview.carbs}   target={targets.carbs}   />
                      <MacroProgressRow label="Fat"     color="#818cf8" after={afterFat}     delta={preview.fat}     target={targets.fat}     />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Activity equivalent */}
            {actItems.length > 0 && preview && (
              <div className="rounded-[16px] px-4 py-2.5 flex flex-col gap-2"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[11px] font-semibold text-white/45 text-center">
                  Burn <span className="text-orange-400 font-bold">{Math.round(preview.kcal)} kcal</span> with
                </p>
                <div className="flex gap-2">
                  {actItems.map((a, i) => <ActivityCard key={i} emoji={a.emoji} label={a.label} min={a.min} />)}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Sleek dark log button */}
        <div className="shrink-0">
          <div className="max-w-md mx-auto px-4 pt-1.5 pb-4">
            <button onClick={handleSave} disabled={saving || !preview}
              className="w-full h-[46px] rounded-[16px] font-bold text-[14px] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-30"
              style={{
                background: preview
                  ? 'linear-gradient(135deg, rgba(45,212,191,0.18), rgba(20,184,166,0.12))'
                  : 'rgba(255,255,255,0.04)',
                border: preview
                  ? '1.5px solid rgba(45,212,191,0.38)'
                  : '1px solid rgba(255,255,255,0.07)',
                color: preview ? 'rgb(45,212,191)' : 'rgba(255,255,255,0.22)',
              }}>
              {saving ? (
                <span className="opacity-70">Saving…</span>
              ) : (
                <>
                  <span>{MEAL_ICONS[meal]}</span>
                  <span>Log · {MEAL_LABELS_SHORT[meal] ?? meal}</span>
                  {preview && <span className="font-normal text-[12px]" style={{ opacity: 0.55 }}>· {Math.round(preview.kcal)} kcal</span>}
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </>
  )
}
