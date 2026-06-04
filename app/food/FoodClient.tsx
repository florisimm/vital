'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, SectionHeader, NutritionProgressBar } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import type { FoodLogEntry, Product } from '@/lib/types'
import { fetchFoodData, fetchProducts, type Targets } from '@/app/food/fetchers'
import { getMealForHour, formatDayLabel, MEAL_ORDER, MEAL_LABELS, MEAL_ICONS, type MacroKey, MACRO_LABEL, MACRO_UNIT } from '@/app/food/meal-config'
import { MealSection } from '@/app/food/components/MealSection'
import { MacroDrillSheet } from '@/app/food/components/MacroDrillSheet'
import { EditFoodSheet } from '@/app/food/components/EditFoodSheet'
import { AddFoodSheet } from '@/app/food/components/AddFoodSheet'

// ─── Main component ───────────────────────────────────────────────────────────

export function FoodClient() {
  const todayStr = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

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
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return
    const diffX = touchStartX.current - e.changedTouches[0].clientX
    const diffY = touchStartY.current - e.changedTouches[0].clientY
    // Only navigate if swipe is more horizontal than vertical
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      navigate(diffX > 0 ? 'left' : 'right')
    }
    touchStartX.current = null
    touchStartY.current = null
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
