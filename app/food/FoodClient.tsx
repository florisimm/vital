'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Plus, ChevronRight, ChevronLeft, Trash2, X, Search, Camera, Utensils, ScanLine, ChevronDown, Check } from 'lucide-react'
import { Card, SectionHeader, NutritionProgressBar } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import { BarcodeScanner } from '@/components/BarcodeScanner'

// ─── Types ────────────────────────────────────────────────────────────────────

type FoodLogEntry = {
  id: string
  meal_category: string
  food_name: string
  amount_g: number | null
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  logged_at: string
}

type Product = {
  id: string
  name: string
  brand: string | null
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  servings: { label: string; amount_g: number }[] | null
}

type Targets = { kcal: number; protein: number; carbs: number; fat: number }

type TemplateFoodItem = {
  food_name: string; brand: string | null; amount_g: number
  kcal: number; protein: number; carbs: number; fat: number
}

type MealTemplate = {
  id: string; name: string; description: string | null
  foods: TemplateFoodItem[]
}

const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

// ─── Meal config ──────────────────────────────────────────────────────────────

function getMealForHour(): string {
  const h = new Date().getHours()
  if (h >= 6  && h < 11) return 'ontbijt'
  if (h >= 11 && h < 12) return 'snack_ochtend'
  if (h >= 12 && h < 14) return 'lunch'
  if (h >= 14 && h < 17) return 'snack_middag'
  if (h >= 17 && h < 19) return 'avondeten'
  return 'snack_avond'
}

const MEAL_ORDER = ['ontbijt', 'snack_ochtend', 'lunch', 'snack_middag', 'avondeten', 'snack_avond', 'supps']

const MEAL_LABELS: Record<string, string> = {
  ontbijt:       'Breakfast',
  snack_ochtend: 'Snacks After Breakfast',
  lunch:         'Lunch',
  snack_middag:  'Snacks After Lunch',
  avondeten:     'Dinner',
  snack_avond:   'Snacks After Dinner',
  supps:         'Supplements',
}

const MEAL_ICONS: Record<string, string> = {
  ontbijt:       '🌅',
  snack_ochtend: '🍎',
  lunch:         '☀️',
  snack_middag:  '🥗',
  avondeten:     '🌙',
  snack_avond:   '🍿',
  supps:         '💊',
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchFoodData(date: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const [{ data: foodLog }, { data: settings }] = await Promise.all([
    supabase
      .from('food_log')
      .select('id, meal_category, food_name, amount_g, kcal, protein, carbs, fat, logged_at')
      .eq('user_id', user.id)
      .eq('date', date)
      .order('logged_at', { ascending: true }),
    supabase
      .from('user_settings')
      .select('macro_kcal, macro_protein, macro_carbs, macro_fat')
      .eq('user_id', user.id)
      .single(),
  ])

  return {
    foodLog: (foodLog ?? []) as FoodLogEntry[],
    targets: {
      kcal: Number(settings?.macro_kcal ?? 2500),
      protein: Number(settings?.macro_protein ?? 180),
      carbs: Number(settings?.macro_carbs ?? 250),
      fat: Number(settings?.macro_fat ?? 80),
    } as Targets,
    userId: user.id,
    today: date,
  }
}

function formatDayLabel(dateStr: string) {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (dateStr === today) return 'Vandaag'
  if (dateStr === yesterday) return 'Gisteren'
  if (dateStr === tomorrow) return 'Morgen'
  return new Date(dateStr).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })
}

async function fetchMealTemplates(): Promise<MealTemplate[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('meal_templates').select('id,name,description,foods')
    .eq('user_id', user.id).order('created_at', { ascending: false })
  return (data ?? []).map(r => ({
    id: r.id, name: r.name, description: r.description,
    foods: Array.isArray(r.foods) ? r.foods : [],
  }))
}

async function fetchProducts() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('products')
    .select('id, name, brand, kcal, protein, carbs, fat, servings')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order('name')
  return (data ?? []) as Product[]
}

async function fetchFoodFrequency(): Promise<Record<string, number>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const since = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
  const { data } = await supabase
    .from('food_log')
    .select('food_name')
    .eq('user_id', user.id)
    .gte('date', since)
  const freq: Record<string, number> = {}
  for (const row of data ?? []) {
    const key = (row.food_name ?? '').toLowerCase()
    freq[key] = (freq[key] ?? 0) + 1
  }
  return freq
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FoodClient() {
  const todayStr = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const touchStartX = useRef<number | null>(null)

  const { data, mutate, error, isLoading } = useSWR(
    `food-log-${selectedDate}`,
    () => fetchFoodData(selectedDate),
    { revalidateOnFocus: false, dedupingInterval: 10_000 }
  )
  const { data: products = [] } = useSWR('products', fetchProducts, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  const [showAddSheet, setShowAddSheet] = useState(false)
  const [preselectedMeal, setPreselectedMeal] = useState(getMealForHour)
  const [macroDrill, setMacroDrill] = useState<'kcal' | 'protein' | 'carbs' | 'fat' | null>(null)
  const [editEntry, setEditEntry] = useState<FoodLogEntry | null>(null)

  useEffect(() => {
    const open = showAddSheet || !!editEntry
    document.body.style.overflow = open ? 'hidden' : ''
    const nav = document.querySelector('[data-bottom-nav]') as HTMLElement | null
    if (nav) nav.style.display = open ? 'none' : ''
    return () => {
      document.body.style.overflow = ''
      const nav = document.querySelector('[data-bottom-nav]') as HTMLElement | null
      if (nav) nav.style.display = ''
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

  const log = data?.foodLog ?? []
  const targets = data?.targets ?? { kcal: 2500, protein: 180, carbs: 250, fat: 80 }
  const userId = data?.userId ?? ''
  const isToday = selectedDate === todayStr

  const totals = useMemo(() => ({
    kcal: log.reduce((s, f) => s + Number(f.kcal ?? 0), 0),
    protein: log.reduce((s, f) => s + Number(f.protein ?? 0), 0),
    carbs: log.reduce((s, f) => s + Number(f.carbs ?? 0), 0),
    fat: log.reduce((s, f) => s + Number(f.fat ?? 0), 0),
  }), [log])

  async function deleteEntry(id: string) {
    mutate(prev => prev ? { ...prev, foodLog: prev.foodLog.filter(f => f.id !== id) } : prev, false)
    const supabase = createClient()
    await supabase.from('food_log').delete().eq('id', id)
  }

  function onAdded(entry: FoodLogEntry) {
    mutate(prev => prev ? { ...prev, foodLog: [...prev.foodLog, entry] } : prev, false)
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

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <p className="text-white/40 text-[15px] text-center">Kon data niet laden</p>
        <p className="text-white/20 text-[12px] text-center">{String(error)}</p>
        <button onClick={() => mutate()} className="text-teal-400 text-[15px] font-medium">Opnieuw proberen</button>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4">
        {[180, 90, 56, 56, 56].map((h, i) => (
          <div key={i} className="animate-pulse rounded-3xl" style={{ height: h, background: 'rgba(255,255,255,0.10)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[22px]" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Day navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('right')} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={18} className="text-white/70" />
        </button>
        <span className="text-[17px] font-semibold text-white">{formatDayLabel(selectedDate)}</span>
        <button onClick={() => navigate('left')} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronRight size={18} className="text-white/70" />
        </button>
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
      <Card>
        <div className="flex flex-col gap-[18px]">
          <SectionHeader title="Macros" />
          {([
            { key: 'kcal',    label: 'Calorieën',    unit: 'kcal', tint: 'bg-orange-400' },
            { key: 'protein', label: 'Eiwit',        unit: 'g',    tint: 'bg-teal-400'   },
            { key: 'carbs',   label: 'Koolhydraten', unit: 'g',    tint: 'bg-yellow-400' },
            { key: 'fat',     label: 'Vet',          unit: 'g',    tint: 'bg-indigo-400' },
          ] as const).map(({ key, label, unit, tint }) => (
            <button key={key} className="w-full text-left active:opacity-60 transition-opacity" onClick={() => setMacroDrill(key)}>
              <NutritionProgressBar label={label} current={totals[key]} target={targets[key]} unit={unit} tint={tint} />
            </button>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-3.5">
        <SectionHeader title="Today's Meals" />
        {MEAL_ORDER.filter(meal => (mealMap[meal] ?? []).length > 0).map(meal => (
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
      </div>{/* end slide wrapper */}

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

      <button
        onClick={() => { setPreselectedMeal(getMealForHour()); setShowAddSheet(true) }}
        className="fixed bottom-[88px] right-5 z-40 w-[56px] h-[56px] rounded-full flex items-center justify-center border border-white/20 shadow-xl"
        style={{ background: 'rgba(255,255,255,0.12)' }}
        aria-label="Voeding toevoegen"
      >
        <Plus size={24} className="text-white" strokeWidth={2.2} />
      </button>

      {showAddSheet && (
        <AddFoodSheet
          products={products}
          preselectedMeal={preselectedMeal}
          userId={userId}
          today={selectedDate}
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

// ─── Macro drill-down sheet ───────────────────────────────────────────────────

type MacroKey = 'kcal' | 'protein' | 'carbs' | 'fat'
const MACRO_LABEL: Record<MacroKey, string> = { kcal: 'Calorieën', protein: 'Eiwit', carbs: 'Koolhydraten', fat: 'Vet' }
const MACRO_UNIT: Record<MacroKey, string>  = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g' }

function MacroDrillSheet({ macro, log, onClose }: { macro: MacroKey; log: FoodLogEntry[]; onClose: () => void }) {
  const groups = MEAL_ORDER
    .map(meal => ({
      meal,
      items: log
        .filter(e => e.meal_category === meal)
        .sort((a, b) => Number(b[macro] ?? 0) - Number(a[macro] ?? 0)),
    }))
    .filter(g => g.items.length > 0)

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <div className="w-16" />
        <span className="text-[17px] font-semibold text-white">{MACRO_LABEL[macro]}</span>
        <button onClick={onClose} className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold">Klaar</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-12 flex flex-col gap-5">
        {groups.length === 0 ? (
          <p className="text-white/40 text-[15px] text-center mt-10">Nog niets gelogd vandaag</p>
        ) : groups.map(({ meal, items }) => {
          const groupTotal = items.reduce((s, e) => s + Number(e[macro] ?? 0), 0)
          return (
            <div key={meal} className="flex flex-col gap-2">
              {/* Group header */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[13px] font-semibold text-white/50 uppercase tracking-wider">
                  {MEAL_ICONS[meal]} {MEAL_LABELS[meal] ?? meal}
                </span>
                <span className="text-[13px] font-semibold text-white/50">
                  {Math.round(groupTotal)}{MACRO_UNIT[macro]}
                </span>
              </div>
              {/* Items */}
              <div className="rounded-[14px] overflow-hidden flex flex-col" style={{ background: 'rgba(255,255,255,0.07)' }}>
                {items.map((item, i) => (
                  <div key={item.id ?? i}
                    className="px-4 py-3.5"
                    style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <span className="text-[15px] font-semibold text-white">{cap(item.food_name)}</span>
                    <p className="text-[13px] text-white/40 mt-0.5">
                      {item.amount_g ? `${item.amount_g}g • ` : ''}
                      {Math.round(Number(item[macro] ?? 0))} {MACRO_UNIT[macro]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Edit food sheet ─────────────────────────────────────────────────────────

function EditFoodSheet({ entry, userId, onSaved, onClose }: {
  entry: FoodLogEntry; userId: string
  onSaved: (updated: FoodLogEntry) => void; onClose: () => void
}) {
  const hasGrams = Number(entry.amount_g) > 0
  const per100g = hasGrams ? {
    kcal:    (Number(entry.kcal    ?? 0) / Number(entry.amount_g)) * 100,
    protein: (Number(entry.protein ?? 0) / Number(entry.amount_g)) * 100,
    carbs:   (Number(entry.carbs   ?? 0) / Number(entry.amount_g)) * 100,
    fat:     (Number(entry.fat     ?? 0) / Number(entry.amount_g)) * 100,
  } : null

  const [grams, setGrams] = useState(hasGrams ? String(Math.round(Number(entry.amount_g))) : '100')
  const [meal, setMeal] = useState(entry.meal_category)
  const [saving, setSaving] = useState(false)

  const g = Number(grams) || 0
  const preview = per100g && g > 0 ? {
    kcal:    Math.round(per100g.kcal    * g / 100),
    protein: Math.round(per100g.protein * g / 100 * 10) / 10,
    carbs:   Math.round(per100g.carbs   * g / 100 * 10) / 10,
    fat:     Math.round(per100g.fat     * g / 100 * 10) / 10,
  } : null

  async function handleSave() {
    setSaving(true)
    try {
      const supabase = createClient()
      const updates = {
        meal_category: meal,
        ...(preview ? { amount_g: g, kcal: preview.kcal, protein: preview.protein, carbs: preview.carbs, fat: preview.fat } : {}),
      }
      const { data, error } = await supabase
        .from('food_log')
        .update(updates)
        .eq('id', entry.id)
        .select('id,meal_category,food_name,amount_g,kcal,protein,carbs,fat,logged_at')
        .single()
      if (!error && data) onSaved(data as FoodLogEntry)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative flex flex-col max-h-[90vh] rounded-t-[24px] overflow-hidden"
        style={{ background: 'rgb(10,12,14)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <span className="text-[17px] font-bold text-white flex-1 mr-4 truncate">{cap(entry.food_name)}</span>
          <button onClick={handleSave} className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X size={16} className="text-white/70" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-8 flex flex-col gap-5">
          {/* Gram stepper */}
          {per100g && (
            <>
              <div className="flex items-center justify-between py-4 rounded-[16px] px-4"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <button onClick={() => setGrams(v => String(Math.max(5, Number(v) - 25)))}
                  className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-[24px] text-white"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>−</button>
                <div className="flex items-baseline gap-1">
                  <input type="number" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)}
                    className="text-[48px] font-bold text-white bg-transparent text-center outline-none w-28" />
                  <span className="text-[22px] text-white/50">g</span>
                </div>
                <button onClick={() => setGrams(v => String(Number(v) + 25))}
                  className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-[24px] text-white"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>+</button>
              </div>

              {/* Macro preview */}
              {preview && (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Kcal',   value: `${preview.kcal}`,        color: '#fb923c' },
                    { label: 'Protein', value: `${preview.protein}g`,   color: '#2dd4bf' },
                    { label: 'Carbs',  value: `${preview.carbs}g`,      color: '#facc15' },
                    { label: 'Fat',    value: `${preview.fat}g`,        color: '#818cf8' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex flex-col items-center gap-1 py-3 rounded-[14px]"
                      style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <span className="text-[15px] font-bold" style={{ color }}>{value}</span>
                      <span className="text-[11px] text-white/40">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Meal category picker */}
          <div className="rounded-[14px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {MEAL_ORDER.map((m, i) => (
              <button key={m} onClick={() => setMeal(m)} className="w-full flex items-center gap-3 px-4 py-3"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <span className="text-[16px] w-7 text-center">{MEAL_ICONS[m]}</span>
                <span className="flex-1 text-[14px] text-white text-left">{MEAL_LABELS[m]}</span>
                {meal === m && <Check size={15} className="text-teal-400 shrink-0" />}
              </button>
            ))}
          </div>

          <button onClick={handleSave} disabled={saving}
            className="h-[52px] rounded-[16px] bg-white text-black font-semibold text-[16px] disabled:opacity-30">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Meal section (always expanded) ──────────────────────────────────────────

function MealSection({ meal, icon, label, entries, onDelete, onEdit, onAdd }: {
  meal: string; icon: string; label: string; entries: FoodLogEntry[]
  onDelete: (id: string) => void; onEdit: (entry: FoodLogEntry) => void; onAdd: () => void
}) {
  const mealKcal = entries.reduce((s, f) => s + Number(f.kcal ?? 0), 0)

  return (
    <div className="rounded-[18px] border border-white/[0.055] overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.055)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="text-[18px] w-7 text-center">{icon}</span>
        <span className="flex-1 text-[16px] font-semibold text-white">{label}</span>
        {mealKcal > 0 && (
          <span className="text-[13px] font-medium text-white/40">{Math.round(mealKcal)} kcal</span>
        )}
      </div>

      {/* Food entries — tap left side to edit, trash to delete */}
      {entries.map((entry) => (
        <div key={entry.id}
          className="flex items-center justify-between px-4 py-3 border-t border-white/[0.05]">
          <button className="flex-1 text-left active:opacity-60 transition-opacity" onClick={() => onEdit(entry)}>
            <p className="text-[15px] font-medium text-white">{cap(entry.food_name)}</p>
            <p className="text-[12px] text-white/40">
              {entry.amount_g ? `${Math.round(Number(entry.amount_g))}g · ` : ''}
              {Math.round(Number(entry.kcal ?? 0))} kcal
              {Number(entry.protein) > 0 ? ` · P: ${Math.round(Number(entry.protein))}g` : ''}
            </p>
          </button>
          <button onClick={() => onDelete(entry.id)} className="ml-3 shrink-0 p-1">
            <Trash2 size={14} className="text-white/20 hover:text-red-400 transition-colors" />
          </button>
        </div>
      ))}

      {/* Add button */}
      <button onClick={onAdd}
        className="flex items-center gap-2 px-4 py-3 w-full border-t border-white/[0.05] text-[14px] font-medium"
        style={{ color: 'rgb(45,212,191)' }}>
        <Plus size={13} strokeWidth={2.5} />
        Add food
      </button>
    </div>
  )
}

// ─── Custom food view ────────────────────────────────────────────────────────

function CustomFoodView({ userId, today, meal, setMeal, onAdded, onClose }: {
  userId: string; today: string; meal: string
  setMeal: (m: string) => void
  onAdded: (e: FoodLogEntry) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({ name: '', brand: '', kcal: '', protein: '', carbs: '', sugars: '', fat: '', caffeine: '', alcohol: '', barcode: '' })
  const [grams, setGrams] = useState('100')
  const [saving, setSaving] = useState(false)

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  const g = Number(grams) || 0
  const preview = {
    kcal:    Math.round(Number(form.kcal)    * g / 100),
    protein: Math.round(Number(form.protein) * g / 100 * 10) / 10,
    carbs:   Math.round(Number(form.carbs)   * g / 100 * 10) / 10,
    fat:     Math.round(Number(form.fat)     * g / 100 * 10) / 10,
  }

  async function handleSave() {
    if (!form.name.trim() || !form.kcal) return
    setSaving(true)
    try {
      const supabase = createClient()
      // Save to products table
      await supabase.from('products').insert({
        user_id: userId, name: form.name.trim(), brand: form.brand || '',
        kcal: Number(form.kcal), protein: Number(form.protein), carbs: Number(form.carbs),
        sugars: Number(form.sugars), fat: Number(form.fat),
        caffeine: form.caffeine ? Number(form.caffeine) : null,
        alcohol: form.alcohol ? Number(form.alcohol) : null,
      })
      // Also log to food_log
      const { data, error } = await supabase.from('food_log').insert({
        user_id: userId, date: today, meal_category: meal,
        food_name: form.name.trim(), amount_g: g,
        kcal: preview.kcal, protein: preview.protein, carbs: preview.carbs, fat: preview.fat,
        sugars: 0, brand: form.brand || '',
      }).select('id,meal_category,food_name,amount_g,kcal,protein,carbs,fat,logged_at').single()
      if (!error && data) onAdded(data as FoodLogEntry)
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { key: 'kcal',     label: 'Calorieën',      unit: 'kcal', color: '#fb923c' },
    { key: 'protein',  label: 'Eiwit',           unit: 'g',    color: '#2dd4bf' },
    { key: 'carbs',    label: 'Koolhydraten',    unit: 'g',    color: '#facc15' },
    { key: 'sugars',   label: 'Waarvan suikers', unit: 'g',    color: '#f472b6' },
    { key: 'fat',      label: 'Vet',             unit: 'g',    color: '#818cf8' },
    { key: 'caffeine', label: 'Cafeïne',         unit: 'mg',   color: '#a78bfa' },
    { key: 'alcohol',  label: 'Alcohol',         unit: 'g',    color: '#f87171' },
  ]

  return (
    <div className="flex flex-col flex-1 overflow-y-auto px-5 pb-8 gap-4">
      {/* Name + brand */}
      <input type="text" placeholder="Productnaam *" value={form.name} onChange={e => set('name', e.target.value)}
        className="h-[46px] px-4 rounded-[12px] text-white placeholder:text-white/30 text-[16px] outline-none font-semibold"
        style={{ background: 'rgba(255,255,255,0.08)' }} />
      <input type="text" placeholder="Brand (optional)" value={form.brand} onChange={e => set('brand', e.target.value)}
        className="h-[46px] px-4 rounded-[12px] text-white placeholder:text-white/30 text-[15px] outline-none"
        style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* Macros per 100g */}
      <p className="text-[12px] font-semibold text-white/40 uppercase tracking-widest">Per 100g</p>
      <div className="flex flex-col rounded-[14px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {fields.map((f, i) => (
          <div key={f.key} className="flex items-center justify-between px-4 py-3.5"
            style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <span className="text-[15px] font-medium text-white">{f.label}</span>
            <div className="flex items-center gap-1">
              <input type="number" inputMode="decimal" placeholder="0"
                value={form[f.key as keyof typeof form]}
                onChange={e => set(f.key, e.target.value)}
                className="w-16 h-8 text-right rounded-[8px] text-white text-[15px] font-semibold outline-none px-2"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              />
              <span className="text-[13px] text-white/40 w-7">{f.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.kcal}
        className="h-[52px] rounded-[16px] bg-white text-black font-semibold text-[16px] disabled:opacity-30">
        {saving ? 'Opslaan…' : 'Toevoegen'}
      </button>
    </div>
  )
}

// ─── Create meal view ────────────────────────────────────────────────────────

function CreateMealView({ newMealName, setNewMealName, templateItems, setTemplateItems, products, freqMap, savingTemplate, onSave }: {
  newMealName: string
  setNewMealName: (v: string) => void
  templateItems: TemplateFoodItem[]
  setTemplateItems: React.Dispatch<React.SetStateAction<TemplateFoodItem[]>>
  products: Product[]
  freqMap: Record<string, number>
  savingTemplate: boolean
  onSave: () => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null)
  const [pickerGrams, setPickerGrams] = useState('100')
  const [editIndex, setEditIndex] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase()
    const list = query ? products.filter(p => p.name.toLowerCase().includes(query)) : products
    return [...list]
      .sort((a, b) => {
        const diff = (freqMap[b.name.toLowerCase()] ?? 0) - (freqMap[a.name.toLowerCase()] ?? 0)
        return diff !== 0 ? diff : a.name.localeCompare(b.name, 'nl')
      })
      .slice(0, 40)
  }, [pickerSearch, products, freqMap])

  function addToMeal() {
    if (!pickerProduct) return
    const g = Number(pickerGrams) || 100
    const item = {
      food_name: pickerProduct.name,
      brand: pickerProduct.brand,
      amount_g: g,
      kcal:    Math.round((Number(pickerProduct.kcal    ?? 0) * g) / 100),
      protein: Math.round((Number(pickerProduct.protein ?? 0) * g) / 100 * 10) / 10,
      carbs:   Math.round((Number(pickerProduct.carbs   ?? 0) * g) / 100 * 10) / 10,
      fat:     Math.round((Number(pickerProduct.fat     ?? 0) * g) / 100 * 10) / 10,
    }
    if (editIndex !== null) {
      setTemplateItems(prev => prev.map((p, i) => i === editIndex ? item : p))
      setEditIndex(null)
    } else {
      setTemplateItems(prev => [...prev, item])
    }
    setPickerProduct(null)
    setPickerGrams('100')
    setPickerSearch('')
    setShowPicker(false)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Product picker overlay */}
      {showPicker && (
        <div className="absolute inset-0 flex flex-col z-10" style={{ background: 'rgb(10,12,14)' }}>
          <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
            <button onClick={() => { setShowPicker(false); setPickerProduct(null); setPickerSearch('') }}
              className="text-[16px] font-medium text-white/60">‹ Terug</button>
            <span className="text-[16px] font-bold text-white">
              {pickerProduct ? pickerProduct.name : 'Pick product'}
            </span>
            <div className="w-14" />
          </div>

          {pickerProduct ? (
            /* Gram input */
            <div className="flex flex-col flex-1 px-5 gap-6 pt-4">
              <div className="flex items-center justify-between py-4 rounded-[16px] px-4"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <button onClick={() => setPickerGrams(g => String(Math.max(0, Number(g) - 25)))}
                  className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-[24px] text-white"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>−</button>
                <div className="flex items-baseline gap-1">
                  <input type="number" value={pickerGrams} onChange={e => setPickerGrams(e.target.value)}
                    className="text-[48px] font-bold text-white bg-transparent text-center outline-none w-28" />
                  <span className="text-[22px] text-white/50">g</span>
                </div>
                <button onClick={() => setPickerGrams(g => String(Number(g) + 25))}
                  className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-[24px] text-white"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>+</button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  ...(pickerProduct.servings ?? []),
                  ...[30, 50, 100, 150, 200]
                    .filter(g => !(pickerProduct.servings ?? []).some(s => s.amount_g === g))
                    .map(g => ({ label: `${g}g`, amount_g: g })),
                ].sort((a, b) => a.amount_g - b.amount_g).map((s, i) => (
                  <button key={i} onClick={() => setPickerGrams(String(s.amount_g))}
                    className="px-3 py-1.5 rounded-full text-[13px] font-semibold"
                    style={pickerGrams === String(s.amount_g)
                      ? { background: 'white', color: 'black' }
                      : { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Kcal',  value: `${Math.round(Number(pickerProduct.kcal??0)*Number(pickerGrams)/100)}`,       color: '#fb923c' },
                  { label: 'Eiwit', value: `${(Number(pickerProduct.protein??0)*Number(pickerGrams)/100).toFixed(1)}g`,  color: '#2dd4bf' },
                  { label: 'Koolh',value: `${(Number(pickerProduct.carbs??0)*Number(pickerGrams)/100).toFixed(1)}g`,     color: '#facc15' },
                  { label: 'Vet',   value: `${(Number(pickerProduct.fat??0)*Number(pickerGrams)/100).toFixed(1)}g`,      color: '#818cf8' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1 py-3 rounded-[14px]"
                    style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <span className="text-[15px] font-bold" style={{ color }}>{value}</span>
                    <span className="text-[11px] text-white/40">{label}</span>
                  </div>
                ))}
              </div>
              <button onClick={addToMeal}
                className="h-[52px] rounded-[16px] bg-white text-black font-semibold text-[16px]">
                {editIndex !== null ? 'Update' : 'Add to meal'}
              </button>
            </div>
          ) : (
            /* Product list */
            <div className="flex flex-col flex-1 min-h-0 px-5 gap-3">
              <div className="flex items-center gap-3 h-[46px] px-4 rounded-[12px] shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)' }}>
                <Search size={15} className="text-white/40 shrink-0" />
                <input autoFocus type="text" placeholder="Search product…" value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  className="flex-1 bg-transparent text-white placeholder:text-white/30 text-[15px] outline-none" />
              </div>
              <div className="overflow-y-auto flex flex-col rounded-[14px] overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                {filtered.map((p, i) => (
                  <button key={p.id} onClick={() => { setPickerProduct(p); setPickerGrams('100') }}
                    className="flex items-center justify-between px-4 py-3.5 text-left"
                    style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <div>
                      <p className="text-[15px] font-semibold text-white">{cap(p.name)}</p>
                      {p.brand && <p className="text-[12px] text-white/40">{p.brand}</p>}
                    </div>
                    <span className="text-[13px] font-semibold text-orange-400 shrink-0 ml-3">
                      {Math.round(Number(p.kcal ?? 0))} kcal
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main create meal view */}
      <div className="flex flex-col flex-1 px-5 pb-8 gap-4 overflow-y-auto">
        <input type="text" placeholder="Meal name…" value={newMealName}
          onChange={e => setNewMealName(e.target.value)}
          className="h-[46px] px-4 rounded-[12px] text-white placeholder:text-white/30 text-[16px] outline-none font-semibold shrink-0"
          style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Added items */}
        {templateItems.length > 0 && (
          <div className="flex flex-col rounded-[14px] overflow-hidden shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            {templateItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <button className="flex-1 text-left" onClick={() => {
                  // Find matching product or create synthetic one for editing
                  const synth: Product = { id: 'edit', name: item.food_name, brand: item.brand, kcal: item.amount_g > 0 ? Math.round(item.kcal / item.amount_g * 100) : 0, protein: item.amount_g > 0 ? Math.round(item.protein / item.amount_g * 1000) / 10 : 0, carbs: item.amount_g > 0 ? Math.round(item.carbs / item.amount_g * 1000) / 10 : 0, fat: item.amount_g > 0 ? Math.round(item.fat / item.amount_g * 1000) / 10 : 0, servings: null }
                  setPickerProduct(synth)
                  setPickerGrams(String(item.amount_g))
                  setEditIndex(i)
                  setShowPicker(true)
                }}>
                  <p className="text-[14px] font-medium text-white">{cap(item.food_name)}</p>
                  <p className="text-[12px] text-white/40">{item.amount_g}g · {item.kcal} kcal · {item.protein}g protein</p>
                </button>
                <button onClick={() => setTemplateItems(prev => prev.filter((_, j) => j !== i))}>
                  <X size={14} className="text-white/30" />
                </button>
              </div>
            ))}
            <div className="px-4 py-2 border-t border-white/[0.05]">
              <p className="text-[12px] text-white/40">
                Total: {templateItems.reduce((s, f) => s + f.kcal, 0)} kcal · {templateItems.reduce((s, f) => s + f.protein, 0).toFixed(1)}g protein
              </p>
            </div>
          </div>
        )}

        <button onClick={() => setShowPicker(true)}
          className="flex items-center gap-3 w-full px-4 py-3.5 rounded-[14px] border border-white/10 shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          <Plus size={18} className="text-white/60" />
          <span className="text-[15px] font-semibold text-white/60">Add product</span>
        </button>

        <button onClick={onSave}
          disabled={savingTemplate || !newMealName.trim() || !templateItems.length}
          className="h-[52px] rounded-[16px] bg-white text-black font-semibold text-[16px] disabled:opacity-30 shrink-0">
          {savingTemplate ? 'Saving…' : 'Save meal'}
        </button>
      </div>
    </div>
  )
}

// ─── Add food sheet ───────────────────────────────────────────────────────────

type SheetView = 'options' | 'search' | 'detail' | 'scan' | 'meals' | 'create-meal' | 'meal-confirm' | 'custom-food'

function AddFoodSheet({ products, preselectedMeal, userId, today, onAdded, onClose }: {
  products: Product[]; preselectedMeal: string; userId: string; today: string
  onAdded: (entry: FoodLogEntry) => void; onClose: () => void
}) {
  const [view, setView] = useState<SheetView>('options')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [grams, setGrams] = useState('100')
  const [selectedServing, setSelectedServing] = useState<{ label: string; amount_g: number } | null>(null)
  const [servingMultiplier, setServingMultiplier] = useState('1')
  const [showServingPicker, setShowServingPicker] = useState(false)
  const [showMealPicker, setShowMealPicker] = useState(false)
  const [meal, setMeal] = useState(preselectedMeal)
  const [saving, setSaving] = useState(false)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)

  const { data: serverFreq = {} } = useSWR('food-frequency', fetchFoodFrequency, {
    revalidateOnFocus: false, dedupingInterval: 300_000,
  })
  const [localFreq, setLocalFreq] = useState<Record<string, number>>({})

  function incrementFrequency(productName: string) {
    const key = productName.toLowerCase()
    setLocalFreq(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))
  }

  const freqMap = useMemo(() => {
    const merged: Record<string, number> = { ...serverFreq }
    for (const [k, v] of Object.entries(localFreq)) {
      merged[k] = (merged[k] ?? 0) + v
    }
    return merged
  }, [serverFreq, localFreq])

  // Meals state
  const { data: templates = [], mutate: mutateTemplates } = useSWR('meal-templates', fetchMealTemplates, { revalidateOnFocus: false })
  const [newMealName, setNewMealName] = useState('')
  const [templateItems, setTemplateItems] = useState<TemplateFoodItem[]>([])
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateGrams, setTemplateGrams] = useState<Record<string, string>>({})
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [confirmTemplate, setConfirmTemplate] = useState<MealTemplate | null>(null)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const list = query ? products.filter(p => p.name.toLowerCase().includes(query)) : products
    return [...list]
      .sort((a, b) => {
        const diff = (freqMap[b.name.toLowerCase()] ?? 0) - (freqMap[a.name.toLowerCase()] ?? 0)
        return diff !== 0 ? diff : a.name.localeCompare(b.name, 'nl')
      })
      .slice(0, 40)
  }, [search, products, freqMap])

  const preview = selected && Number(grams) > 0 ? {
    kcal:    (Number(selected.kcal    ?? 0) * Number(grams)) / 100,
    protein: (Number(selected.protein ?? 0) * Number(grams)) / 100,
    carbs:   (Number(selected.carbs   ?? 0) * Number(grams)) / 100,
    fat:     (Number(selected.fat     ?? 0) * Number(grams)) / 100,
  } : null

  function handleBack() {
    if (view === 'detail') { setSelected(null); setView('search') }
    else if (view === 'search' || view === 'scan' || view === 'meals' || view === 'custom-food') setView('options')
    else if (view === 'create-meal') { setTemplateItems([]); setNewMealName(''); setView('meals') }
    else if (view === 'meal-confirm') { setConfirmTemplate(null); setView('meals') }
    else onClose()
  }

  // ── Barcode scan ──
  async function handleBarcodeDetected(barcode: string) {
    setShowBarcodeScanner(false)
    setBarcodeLoading(true)
    setView('scan')

    try {
      // 1. Look up in local products table first
      const supabase = createClient()
      const { data: localProduct } = await supabase
        .from('products')
        .select('id,name,brand,kcal,protein,carbs,fat,servings')
        .eq('barcode', barcode)
        .maybeSingle()

      if (localProduct) {
        const p = localProduct as Product
        setSelected(p)
        setSelectedServing(null); setServingMultiplier('1')
        setGrams(p.servings?.[0] ? String(p.servings[0].amount_g) : '100')
        setView('detail')
        return
      }

      // 2. Fall back to Open Food Facts
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
      const json = await res.json()

      if (json.status === 1 && json.product) {
        const p = json.product
        const n = p.nutriments ?? {}
        const servingQ = p.serving_quantity ? Math.round(Number(p.serving_quantity)) : null
        const servingLabel = p.serving_size ?? (servingQ ? `${servingQ}g` : null)
        const servings: { label: string; amount_g: number }[] = []
        if (servingQ && servingLabel) servings.push({ label: servingLabel, amount_g: servingQ })
        setSelected({
          id: 'barcode-' + barcode,
          name: p.product_name || p.product_name_nl || 'Unknown product',
          brand: p.brands ?? null,
          kcal: Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0),
          protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
          carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
          fat: Math.round((n.fat_100g ?? 0) * 10) / 10,
          servings,
        })
        setSelectedServing(servings[0] ?? null)
        setGrams(servingQ ? String(servingQ) : '100')
        setView('detail')
      } else {
        // Not found
        setView('search')
      }
    } finally {
      setBarcodeLoading(false)
    }
  }

  // ── Meal templates ──
  const [loggingTemplate, setLoggingTemplate] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  async function logTemplate() {
    if (!confirmTemplate?.foods.length || loggingTemplate) return
    setLoggingTemplate(true)
    try {
      const supabase = createClient()
      const totalKcal    = confirmTemplate.foods.reduce((s, f) => s + f.kcal, 0)
      const totalProtein = confirmTemplate.foods.reduce((s, f) => s + f.protein, 0)
      const totalCarbs   = confirmTemplate.foods.reduce((s, f) => s + f.carbs, 0)
      const totalFat     = confirmTemplate.foods.reduce((s, f) => s + f.fat, 0)
      await supabase.from('food_log').insert({
        user_id: userId, date: today, meal_category: meal,
        food_name: confirmTemplate.name, amount_g: null,
        kcal: Math.round(totalKcal),
        protein: Math.round(totalProtein * 10) / 10,
        carbs: Math.round(totalCarbs * 10) / 10,
        fat: Math.round(totalFat * 10) / 10,
        sugars: 0, brand: '',
      })
      globalMutate(`food-log-${today}`)
      onClose()
    } finally {
      setLoggingTemplate(false)
    }
  }

  async function saveTemplate() {
    if (!newMealName.trim() || !templateItems.length) return
    setSavingTemplate(true)
    const supabase = createClient()
    if (confirmTemplate) {
      // Update existing
      await supabase.from('meal_templates').update({ name: newMealName.trim(), foods: templateItems }).eq('id', confirmTemplate.id)
    } else {
      await supabase.from('meal_templates').insert({ user_id: userId, name: newMealName.trim(), foods: templateItems })
    }
    setSavingTemplate(false)
    mutateTemplates()
    setTemplateItems([]); setNewMealName(''); setConfirmTemplate(null)
    setView('meals')
  }

  function addProductToTemplate(p: Product) {
    const g = Number(templateGrams[p.id] || 100)
    const item: TemplateFoodItem = {
      food_name: p.name, brand: p.brand, amount_g: g,
      kcal: Math.round((Number(p.kcal ?? 0) * g) / 100),
      protein: Math.round((Number(p.protein ?? 0) * g) / 100 * 10) / 10,
      carbs: Math.round((Number(p.carbs ?? 0) * g) / 100 * 10) / 10,
      fat: Math.round((Number(p.fat ?? 0) * g) / 100 * 10) / 10,
    }
    setTemplateItems(prev => [...prev, item])
  }

  async function deleteTemplate(id: string) {
    const supabase = createClient()
    await supabase.from('meal_templates').delete().eq('id', id)
    mutateTemplates()
  }

  async function handleSave() {
    if (!selected || !preview) return
    setSaving(true)
    const supabase = createClient()

    // Save barcode-scanned products to the user's own products table
    if (selected.id.startsWith('barcode-')) {
      await supabase.from('products').upsert({
        user_id: userId,
        name: selected.name,
        brand: selected.brand ?? '',
        kcal: selected.kcal,
        protein: selected.protein,
        carbs: selected.carbs,
        fat: selected.fat,
        servings: selected.servings?.length ? selected.servings : null,
      }, { onConflict: 'user_id,name', ignoreDuplicates: true })
    }

    const { data, error } = await supabase.from('food_log').insert({
      user_id: userId, date: today, meal_category: meal,
      food_name: selected.name, amount_g: Number(grams),
      kcal: Math.round(preview.kcal),
      protein: Math.round(preview.protein * 10) / 10,
      carbs:   Math.round(preview.carbs   * 10) / 10,
      fat:     Math.round(preview.fat     * 10) / 10,
      sugars: 0, brand: selected.brand ?? '',
    }).select('id,meal_category,food_name,amount_g,kcal,protein,carbs,fat,logged_at').single()
    setSaving(false)
    if (!error && data) {
      incrementFrequency(selected.name)
      onAdded(data as FoodLogEntry)
    }
  }

  const sheetTitle = view === 'options' ? 'Add Food'
    : view === 'search' ? 'Search Food'
    : view === 'scan' ? 'Scan Barcode'
    : view === 'meals' ? 'Meals'
    : view === 'meal-confirm' ? confirmTemplate?.name ?? 'Maaltijd'
    : view === 'create-meal' ? (confirmTemplate ? 'Edit meal' : 'New meal')
    : view === 'custom-food' ? 'Custom Food'
    : selected?.name ?? 'Detail'

  const filteredTemplate = useMemo(() => {
    if (!templateSearch.trim()) return products.slice(0, 30)
    return products.filter(p => p.name.toLowerCase().includes(templateSearch.toLowerCase())).slice(0, 30)
  }, [templateSearch, products])

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div
        className="relative flex flex-col flex-1 overflow-hidden"
        style={{ background: 'rgb(10, 12, 14)', overscrollBehavior: 'contain' }}
        onClick={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          {view !== 'options' ? (
            <button onClick={handleBack} className="text-[17px] font-medium text-white/70 w-16">
              ‹ Back
            </button>
          ) : (
            <div className="w-16" />
          )}
          <span className="text-[17px] font-bold text-white">{sheetTitle}</span>
          <button onClick={onClose} className="text-[17px] font-medium text-white/70 w-16 text-right">
            Cancel
          </button>
        </div>

        {/* Barcode scanner overlay */}
        {showBarcodeScanner && (
          <BarcodeScanner
            onDetected={handleBarcodeDetected}
            onClose={() => setShowBarcodeScanner(false)}
          />
        )}

        {/* ── Options view ── */}
        {view === 'options' && (
          <div className="px-5 pb-10 flex flex-col gap-2">
            <div className="rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {[
                { Icon: Search,  iconBg: '#22d3ee', label: 'Search Food', sub: 'Find in nutrition database',       action: () => setView('search') },
                { Icon: Utensils,iconBg: '#4ade80', label: 'Meals',       sub: 'Log a saved meal template',        action: () => setView('meals') },
                { Icon: ScanLine,iconBg: '#fb923c', label: 'Scan Barcode',sub: 'Scan product barcode',             action: () => setShowBarcodeScanner(true) },
                { Icon: Plus,    iconBg: '#a78bfa', label: 'Custom Food', sub: 'Enter nutrition details manually', action: () => setView('custom-food') },
              ].map(({ Icon, iconBg, label, sub, action }, i) => (
                <button key={label} onClick={action}
                  className="w-full flex items-center gap-4 px-4 py-4 text-left"
                  style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{ background: iconBg + '33' }}>
                    <Icon size={18} style={{ color: iconBg }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[16px] font-semibold text-white">{label}</p>
                    <p className="text-[13px] text-white/40">{sub}</p>
                  </div>
                  <ChevronRight size={16} className="text-white/25 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Scan view (loading state) ── */}
        {view === 'scan' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 pb-10 px-5">
            {barcodeLoading ? (
              <>
                <div className="w-16 h-16 rounded-full border-4 border-orange-400 border-t-transparent animate-spin" />
                <p className="text-white/60 text-[16px]">Product opzoeken…</p>
              </>
            ) : (
              <>
                <p className="text-white/40 text-[15px] text-center">Product niet gevonden. Probeer handmatig te zoeken.</p>
                <button onClick={() => setView('search')} className="text-teal-400 font-semibold text-[15px]">Search</button>
              </>
            )}
          </div>
        )}

        {/* ── Meals view ── */}
        {view === 'meals' && (
          <div className="flex flex-col min-h-0 px-5 pb-8 gap-4">
            <button onClick={() => { setTemplateItems([]); setNewMealName(''); setView('create-meal') }}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-[14px] border border-teal-400/30"
              style={{ background: 'rgba(45,212,191,0.08)' }}>
              <Plus size={18} className="text-teal-400" />
              <span className="text-[15px] font-semibold text-teal-400">New Meal Template</span>
            </button>

            {templates.length === 0 ? (
              <p className="text-white/30 text-[15px] text-center mt-4">No meal templates yet</p>
            ) : (
              <div className="overflow-y-auto flex flex-col gap-2">
                {templates.map(t => {
                  const totalKcal = t.foods.reduce((s, f) => s + f.kcal, 0)
                  const totalProtein = t.foods.reduce((s, f) => s + f.protein, 0)
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3.5 rounded-[14px]"
                      style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <button className="flex-1 text-left" onClick={() => { setMenuOpenId(null); setConfirmTemplate(t); setView('meal-confirm') }}>
                        <p className="text-[16px] font-semibold text-white">{cap(t.name)}</p>
                        <p className="text-[12px] text-white/40">
                          {t.foods.length} items · {Math.round(totalKcal)} kcal · {Math.round(totalProtein)}g eiwit
                        </p>
                      </button>
                      <button onClick={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full"
                        style={{ background: 'transparent' }}>
                        <span className="text-white/40 text-[20px] leading-none tracking-widest">···</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        )}

        {/* ── Meal action sheet (3-dot menu) ── */}
        {menuOpenId && (() => {
          const t = templates.find(t => t.id === menuOpenId)
          if (!t) return null
          return (
            <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setMenuOpenId(null)}>
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative flex flex-col gap-2 px-4 pb-8" onClick={e => e.stopPropagation()}
                style={{ animation: 'slideIn 200ms ease-out' }}>
                <div className="rounded-[18px] overflow-hidden" style={{ background: 'rgba(30,30,34,0.98)', backdropFilter: 'blur(20px)' }}>
                  <div className="px-4 py-4 border-b border-white/[0.07]">
                    <p className="text-[15px] font-semibold text-white text-center">{cap(t.name)}</p>
                    <p className="text-[12px] text-white/40 text-center mt-0.5">{t.foods.length} items · {Math.round(t.foods.reduce((s,f)=>s+f.kcal,0))} kcal</p>
                  </div>
                  <button
                    onClick={() => { setMenuOpenId(null); setConfirmTemplate(t); setNewMealName(t.name); setTemplateItems(t.foods); setView('create-meal') }}
                    className="w-full px-4 py-4 text-center text-[17px] text-white border-b border-white/[0.07]">
                    Edit
                  </button>
                  <button
                    onClick={() => { setMenuOpenId(null); deleteTemplate(t.id) }}
                    className="w-full px-4 py-4 text-center text-[17px] text-red-400">
                    Delete
                  </button>
                </div>
                <button onClick={() => setMenuOpenId(null)}
                  className="w-full py-4 rounded-[18px] text-[17px] font-semibold text-white"
                  style={{ background: 'rgba(30,30,34,0.98)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── Meal confirm view ── */}
        {view === 'meal-confirm' && confirmTemplate && (
          <div className="flex flex-col flex-1 px-5 pb-8 gap-5 overflow-y-auto">
            {/* Meal summary */}
            <div className="rounded-[18px] px-5 py-5 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <p className="text-[22px] font-bold text-white">{cap(confirmTemplate.name)}</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Kcal',    value: `${Math.round(confirmTemplate.foods.reduce((s,f)=>s+f.kcal,0))}`,       color: '#fb923c' },
                  { label: 'Eiwit',   value: `${Math.round(confirmTemplate.foods.reduce((s,f)=>s+f.protein,0))}g`,   color: '#2dd4bf' },
                  { label: 'Koolh.',  value: `${Math.round(confirmTemplate.foods.reduce((s,f)=>s+f.carbs,0))}g`,     color: '#facc15' },
                  { label: 'Vet',     value: `${Math.round(confirmTemplate.foods.reduce((s,f)=>s+f.fat,0))}g`,       color: '#818cf8' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1 py-3 rounded-[14px]"
                    style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <span className="text-[17px] font-bold" style={{ color }}>{value}</span>
                    <span className="text-[11px] text-white/40">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dagdeel picker */}
            <div className="rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {MEAL_ORDER.map((m, i) => (
                <button key={m} onClick={() => setMeal(m)}
                  className="w-full flex items-center gap-3 px-4 py-3.5"
                  style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <span className="text-[18px] w-7 text-center">{MEAL_ICONS[m]}</span>
                  <span className="flex-1 text-[15px] font-medium text-white text-left">{MEAL_LABELS[m] ?? m}</span>
                  {meal === m && <span className="text-teal-400 text-[15px]">✓</span>}
                </button>
              ))}
            </div>

            <button onClick={logTemplate} disabled={loggingTemplate}
              className="h-[54px] rounded-[18px] bg-white text-black font-semibold text-[17px] disabled:opacity-40 shrink-0">
              {loggingTemplate ? 'Adding…' : `Add to ${MEAL_LABELS[meal] ?? meal}`}
            </button>
          </div>
        )}

        {/* ── Create meal view ── */}
        {view === 'create-meal' && (
          <CreateMealView
            newMealName={newMealName}
            setNewMealName={setNewMealName}
            templateItems={templateItems}
            setTemplateItems={setTemplateItems}
            products={products}
            freqMap={freqMap}
            savingTemplate={savingTemplate}
            onSave={saveTemplate}
          />
        )}

        {/* ── Custom food view ── */}
        {view === 'custom-food' && (
          <CustomFoodView
            userId={userId}
            today={today}
            meal={meal}
            setMeal={setMeal}
            onAdded={onAdded}
            onClose={onClose}
          />
        )}

        {/* ── Search view ── */}
        {view === 'search' && (
          <div className="flex flex-col min-h-0 px-5 pb-8 gap-3">
            <div className="flex items-center gap-3 h-[46px] px-4 rounded-[12px]"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <Search size={16} className="text-white/40 shrink-0" />
              <input autoFocus type="text" placeholder="Search foods…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-white placeholder:text-white/30 text-[16px] outline-none" />
            </div>
            <div className="overflow-y-auto flex flex-col rounded-[16px] overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              {filtered.map((p, i) => (
                <button key={p.id}
                  onClick={() => { setSelected(p); setSelectedServing(null); setServingMultiplier(p.servings?.[0] ? '1' : '100'); setGrams(p.servings?.[0] ? String(p.servings[0].amount_g) : '100'); setView('detail') }}
                  className="flex items-center justify-between px-4 py-3.5 text-left"
                  style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div>
                    <p className="text-[16px] font-semibold text-white">{cap(p.name)}</p>
                    {p.brand && <p className="text-[12px] text-white/40">{p.brand}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[14px] font-semibold text-orange-400">
                      {Math.round(Number(p.kcal ?? 0))} kcal
                    </span>
                    <ChevronRight size={14} className="text-white/20" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Detail view ── */}
        {view === 'detail' && selected && (
          <div className="overflow-y-auto px-5 pb-8 flex flex-col gap-5" style={{ overscrollBehavior: 'contain' }}>
            {/* Portion selector */}
            {(() => {
              const servings = selected.servings ?? []
              const GRAM_SERVING = { label: 'gram / ml', amount_g: 1 }

              function pickServing(s: { label: string; amount_g: number }) {
                setSelectedServing(s)
                setShowServingPicker(false)
                setGrams(String(Math.round(Number(servingMultiplier) * s.amount_g)))
              }

              const active = selectedServing ?? servings[0] ?? GRAM_SERVING

              return (
                <>
                  <div className="flex gap-2">
                    {/* Multiplier */}
                    <div className="flex items-center justify-center gap-1 px-3 rounded-[14px]"
                      style={{ background: 'rgba(255,255,255,0.08)', minWidth: 72 }}>
                      <input type="number" inputMode="decimal" value={servingMultiplier}
                        onChange={e => {
                          setServingMultiplier(e.target.value)
                          setGrams(String(Math.round(Number(e.target.value) * active.amount_g)))
                        }}
                        className="text-[22px] font-bold text-white bg-transparent text-center outline-none w-12" />
                      <span className="text-[15px] text-white/50">x</span>
                    </div>
                    {/* Portion picker */}
                    <button onClick={() => setShowServingPicker(true)}
                      className="flex-1 flex items-center justify-between px-4 py-4 rounded-[14px]"
                      style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <span className="text-[16px] font-medium text-white">{active.label}</span>
                      <ChevronDown size={16} className="text-white/40" />
                    </button>
                  </div>

                  {/* Serving picker sheet */}
                  {showServingPicker && (
                    <div className="fixed inset-0 z-[200] flex flex-col justify-end"
                      style={{ background: 'rgba(0,0,0,0.5)' }}
                      onClick={() => setShowServingPicker(false)}>
                      <div className="rounded-t-[20px] overflow-hidden pb-safe"
                        style={{ background: 'rgb(28,28,30)' }}
                        onClick={e => e.stopPropagation()}>
                        {servings.map((s, i) => (
                          <button key={i} onClick={() => pickServing(s)}
                            className="w-full flex items-center justify-between px-5 py-4"
                            style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                            <span className="text-[17px] text-white">{s.label}</span>
                            {active.label === s.label && <Check size={18} className="text-teal-400" />}
                          </button>
                        ))}
                        <button onClick={() => pickServing(GRAM_SERVING)}
                          className="w-full flex items-center justify-between px-5 py-4"
                          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                          <span className="text-[17px] text-white">gram / ml</span>
                          {active.label === GRAM_SERVING.label && <Check size={18} className="text-teal-400" />}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* Macro preview */}
            {preview && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Kcal',    value: `${Math.round(preview.kcal)}`,         color: '#fb923c' },
                  { label: 'Protein', value: `${preview.protein.toFixed(1)}g`,      color: '#2dd4bf' },
                  { label: 'Carbs',   value: `${preview.carbs.toFixed(1)}g`,        color: '#facc15' },
                  { label: 'Fat',     value: `${preview.fat.toFixed(1)}g`,          color: '#818cf8' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1 py-3 rounded-[14px]"
                    style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <span className="text-[17px] font-bold" style={{ color }}>{value}</span>
                    <span className="text-[11px] text-white/40">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Meal picker */}
            <button onClick={() => setShowMealPicker(true)}
              className="w-full flex flex-col px-4 py-3.5 rounded-[14px] text-left"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <span className="text-[12px] text-white/40 mb-0.5">Gegeten als</span>
              <div className="flex items-center justify-between">
                <span className="text-[17px] font-semibold text-white">{MEAL_LABELS[meal] ?? meal}</span>
                <ChevronDown size={16} className="text-white/40" />
              </div>
            </button>

            {showMealPicker && (
              <div className="fixed inset-0 z-[200] flex flex-col justify-end"
                style={{ background: 'rgba(0,0,0,0.5)' }}
                onClick={() => setShowMealPicker(false)}>
                <div className="rounded-t-[20px] overflow-hidden"
                  style={{ background: 'rgb(28,28,30)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                  onClick={e => e.stopPropagation()}>
                  {MEAL_ORDER.map((m, i) => (
                    <button key={m} onClick={() => { setMeal(m); setShowMealPicker(false) }}
                      className="w-full flex items-center gap-3 px-5 py-4"
                      style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                      <span className="text-[18px] w-7 text-center">{MEAL_ICONS[m]}</span>
                      <span className="flex-1 text-[17px] text-white text-left">{MEAL_LABELS[m] ?? m}</span>
                      {meal === m && <Check size={18} className="text-teal-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Save */}
            <button onClick={handleSave} disabled={saving || !preview}
              className="h-[54px] rounded-[18px] bg-white text-black font-semibold text-[17px] disabled:opacity-40">
              {saving ? 'Saving…' : `Add to ${MEAL_LABELS[meal] ?? meal}`}
            </button>
          </div>
        )}

        {view === 'options' && <div />  /* spacer for safe area */}

      </div>
    </div>
  )
}
