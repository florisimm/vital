'use client'

import { useState, useMemo, useRef } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Plus, ChevronRight, Trash2, X, Search, Camera, Utensils, Mic } from 'lucide-react'
import { Card, SectionHeader, NutritionProgressBar } from '@/components/ui'
import { createClient } from '@/lib/supabase'

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

// ─── Meal config ──────────────────────────────────────────────────────────────

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

async function fetchFoodData() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const today = new Date().toISOString().split('T')[0]

  const [{ data: foodLog }, { data: settings }] = await Promise.all([
    supabase
      .from('food_log')
      .select('id, meal_category, food_name, amount_g, kcal, protein, carbs, fat, logged_at')
      .eq('user_id', user.id)
      .eq('date', today)
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
    today,
  }
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
    .select('id, name, brand, kcal, protein, carbs, fat')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order('name')
  return (data ?? []) as Product[]
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FoodClient() {
  const { data, mutate } = useSWR('food-log', fetchFoodData, {
    revalidateOnFocus: false,
    dedupingInterval: 10_000,
  })
  const { data: products = [] } = useSWR('products', fetchProducts, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  const [showAddSheet, setShowAddSheet] = useState(false)
  const [preselectedMeal, setPreselectedMeal] = useState('ontbijt')

  // Lock body scroll when sheet is open
  useMemo(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = showAddSheet ? 'hidden' : ''
  }, [showAddSheet])

  const log = data?.foodLog ?? []
  const targets = data?.targets ?? { kcal: 2500, protein: 180, carbs: 250, fat: 80 }
  const userId = data?.userId ?? ''
  const today = data?.today ?? new Date().toISOString().split('T')[0]

  const totals = useMemo(() => ({
    kcal: log.reduce((s, f) => s + Number(f.kcal ?? 0), 0),
    protein: log.reduce((s, f) => s + Number(f.protein ?? 0), 0),
    carbs: log.reduce((s, f) => s + Number(f.carbs ?? 0), 0),
    fat: log.reduce((s, f) => s + Number(f.fat ?? 0), 0),
  }), [log])

  const proteinLeft = targets.protein - totals.protein
  const aiText = proteinLeft > 5
    ? `Nog ${Math.round(proteinLeft)}g eiwit te gaan. Voeg eiwitrijke maaltijd toe bij het avondeten.`
    : 'Alle macro-doelen lopen goed. Blijf consistent met de maaltijdtiming.'

  async function deleteEntry(id: string) {
    // Optimistic update
    mutate(prev => prev ? { ...prev, foodLog: prev.foodLog.filter(f => f.id !== id) } : prev, false)
    const supabase = createClient()
    await supabase.from('food_log').delete().eq('id', id)
  }

  function onAdded(entry: FoodLogEntry) {
    // Optimistic update
    mutate(prev => prev ? { ...prev, foodLog: [...prev.foodLog, entry] } : prev, false)
    setShowAddSheet(false)
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

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        {[200, 100, 60, 60, 60, 60].map((h, i) => (
          <div key={i} className="animate-pulse rounded-3xl" style={{ height: h, background: 'rgba(255,255,255,0.07)' }} />
        ))}
      </div>
    )
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-[18px]">
          <SectionHeader title="Vandaag" />
          <NutritionProgressBar label="Calorieën"    current={totals.kcal}    target={targets.kcal}    unit="kcal" tint="bg-orange-400" />
          <NutritionProgressBar label="Eiwit"        current={totals.protein} target={targets.protein} unit="g"    tint="bg-teal-400"   />
          <NutritionProgressBar label="Koolhydraten" current={totals.carbs}   target={targets.carbs}   unit="g"    tint="bg-yellow-400" />
          <NutritionProgressBar label="Vet"          current={totals.fat}     target={targets.fat}     unit="g"    tint="bg-indigo-400" />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-orange-400">✦</span>
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">AI Inzicht</span>
          </div>
          <p className="text-[20px] font-bold text-white leading-snug">{aiText}</p>
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
            onAdd={() => { setPreselectedMeal(meal); setShowAddSheet(true) }}
          />
        ))}
      </div>

      <button
        onClick={() => { setPreselectedMeal('ontbijt'); setShowAddSheet(true) }}
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
          today={today}
          onAdded={onAdded}
          onClose={() => setShowAddSheet(false)}
        />
      )}
    </>
  )
}

// ─── Meal section (always expanded) ──────────────────────────────────────────

function MealSection({ meal, icon, label, entries, onDelete, onAdd }: {
  meal: string; icon: string; label: string; entries: FoodLogEntry[]
  onDelete: (id: string) => void; onAdd: () => void
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

      {/* Food entries */}
      {entries.map((entry, i) => (
        <div key={entry.id}
          className="flex items-center justify-between px-4 py-3 border-t border-white/[0.05]">
          <div>
            <p className="text-[15px] font-medium text-white">{entry.food_name}</p>
            <p className="text-[12px] text-white/40">
              {entry.amount_g ? `${Math.round(Number(entry.amount_g))}g · ` : ''}
              {Math.round(Number(entry.kcal ?? 0))} kcal
              {Number(entry.protein) > 0 ? ` · P: ${Math.round(Number(entry.protein))}g` : ''}
            </p>
          </div>
          <button onClick={() => onDelete(entry.id)} className="ml-3 shrink-0">
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

// ─── Add food sheet ───────────────────────────────────────────────────────────

type SheetView = 'options' | 'search' | 'detail' | 'scan' | 'meals' | 'create-meal'

function AddFoodSheet({ products, preselectedMeal, userId, today, onAdded, onClose }: {
  products: Product[]; preselectedMeal: string; userId: string; today: string
  onAdded: (entry: FoodLogEntry) => void; onClose: () => void
}) {
  const [view, setView] = useState<SheetView>('options')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [grams, setGrams] = useState('100')
  const [meal, setMeal] = useState(preselectedMeal)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Meals state
  const { data: templates = [], mutate: mutateTemplates } = useSWR('meal-templates', fetchMealTemplates, { revalidateOnFocus: false })
  const [newMealName, setNewMealName] = useState('')
  const [templateItems, setTemplateItems] = useState<TemplateFoodItem[]>([])
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateGrams, setTemplateGrams] = useState<Record<string, string>>({})
  const [savingTemplate, setSavingTemplate] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return products.slice(0, 40)
    return products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 40)
  }, [search, products])

  const preview = selected && Number(grams) > 0 ? {
    kcal:    (Number(selected.kcal    ?? 0) * Number(grams)) / 100,
    protein: (Number(selected.protein ?? 0) * Number(grams)) / 100,
    carbs:   (Number(selected.carbs   ?? 0) * Number(grams)) / 100,
    fat:     (Number(selected.fat     ?? 0) * Number(grams)) / 100,
  } : null

  function handleBack() {
    if (view === 'detail') { setSelected(null); setView('search') }
    else if (view === 'search' || view === 'scan' || view === 'meals') setView('options')
    else if (view === 'create-meal') { setTemplateItems([]); setNewMealName(''); setView('meals') }
    else onClose()
  }

  // ── Scan ──
  async function handleScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setView('scan')
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      try {
        const res = await fetch('/api/scan-food', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        })
        const data = await res.json()
        if (data.name) {
          setSelected({ id: 'scan', name: data.name, brand: 'Scanned', kcal: data.kcal, protein: data.protein, carbs: data.carbs, fat: data.fat })
          setGrams('100')
          setView('detail')
        }
      } finally {
        setScanning(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }

  // ── Meal templates ──
  async function logTemplate(template: MealTemplate) {
    if (!template.foods.length) return
    const supabase = createClient()
    await supabase.from('food_log').insert(
      template.foods.map(f => ({
        user_id: userId, date: today, meal_category: meal,
        food_name: f.food_name, amount_g: f.amount_g,
        kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat,
        sugars: 0, brand: f.brand ?? '',
      }))
    )
    // Refresh food log
    globalMutate('food-log')
    onClose()
  }

  async function saveTemplate() {
    if (!newMealName.trim() || !templateItems.length) return
    setSavingTemplate(true)
    const supabase = createClient()
    await supabase.from('meal_templates').insert({
      user_id: userId, name: newMealName.trim(),
      foods: templateItems,
    })
    setSavingTemplate(false)
    mutateTemplates()
    setTemplateItems([]); setNewMealName('')
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
    if (!error && data) onAdded(data as FoodLogEntry)
  }

  const sheetTitle = view === 'options' ? 'Add Food'
    : view === 'search' ? 'Search Food'
    : view === 'scan' ? 'Scan Meal'
    : view === 'meals' ? 'Meals'
    : view === 'create-meal' ? 'New Meal'
    : selected?.name ?? 'Detail'

  const filteredTemplate = useMemo(() => {
    if (!templateSearch.trim()) return products.slice(0, 30)
    return products.filter(p => p.name.toLowerCase().includes(templateSearch.toLowerCase())).slice(0, 30)
  }, [templateSearch, products])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative flex flex-col max-h-[92vh]"
        style={{ background: 'rgb(10, 12, 14)', borderRadius: '20px 20px 0 0', overscrollBehavior: 'contain' }}
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

        {/* Hidden camera input */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment"
          className="hidden" onChange={handleScanFile} />

        {/* ── Options view ── */}
        {view === 'options' && (
          <div className="px-5 pb-10 flex flex-col gap-2">
            <div className="rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {[
                { Icon: Camera,  iconBg: '#fb923c', label: 'Scan Meal',   sub: 'Use camera to identify food',    action: () => fileRef.current?.click() },
                { Icon: Search,  iconBg: '#22d3ee', label: 'Search Food', sub: 'Find in nutrition database',     action: () => setView('search') },
                { Icon: Utensils,iconBg: '#4ade80', label: 'Meals',       sub: 'Log a saved meal template',      action: () => setView('meals') },
                { Icon: Plus,    iconBg: '#a78bfa', label: 'Custom Food', sub: 'Enter nutrition details manually',action: () => {} },
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

        {/* ── Scan view ── */}
        {view === 'scan' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 pb-10 px-5">
            {scanning ? (
              <>
                <div className="w-16 h-16 rounded-full border-4 border-orange-400 border-t-transparent animate-spin" />
                <p className="text-white/60 text-[16px]">Analyzing image…</p>
              </>
            ) : (
              <>
                <p className="text-white/40 text-[15px] text-center">Something went wrong. Try again.</p>
                <button onClick={() => setView('options')} className="text-teal-400 font-semibold text-[15px]">Go back</button>
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
                      <button className="flex-1 text-left" onClick={() => logTemplate(t)}>
                        <p className="text-[16px] font-semibold text-white">{t.name}</p>
                        <p className="text-[12px] text-white/40">
                          {t.foods.length} items · {Math.round(totalKcal)} kcal · {Math.round(totalProtein)}g eiwit
                        </p>
                      </button>
                      <button onClick={() => deleteTemplate(t.id)}>
                        <Trash2 size={15} className="text-white/20 hover:text-red-400" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Meal picker for logging */}
            <div className="rounded-[14px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {MEAL_ORDER.map((m, i) => (
                <button key={m} onClick={() => setMeal(m)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <span className="text-[16px]">{MEAL_ICONS[m]}</span>
                  <span className="flex-1 text-[14px] text-white">{MEAL_LABELS[m] ?? m}</span>
                  {meal === m && <span className="text-teal-400 text-[13px]">✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Create meal view ── */}
        {view === 'create-meal' && (
          <div className="flex flex-col min-h-0 px-5 pb-8 gap-4">
            <input type="text" placeholder="Meal name…" value={newMealName}
              onChange={e => setNewMealName(e.target.value)}
              className="h-[46px] px-4 rounded-[12px] text-white placeholder:text-white/30 text-[16px] outline-none font-semibold"
              style={{ background: 'rgba(255,255,255,0.08)' }} />

            {/* Added items */}
            {templateItems.length > 0 && (
              <div className="flex flex-col gap-1 rounded-[14px] overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                {templateItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3"
                    style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div>
                      <p className="text-[14px] font-medium text-white">{item.food_name}</p>
                      <p className="text-[12px] text-white/40">{item.amount_g}g · {item.kcal} kcal</p>
                    </div>
                    <button onClick={() => setTemplateItems(prev => prev.filter((_, j) => j !== i))}>
                      <X size={14} className="text-white/30" />
                    </button>
                  </div>
                ))}
                <div className="px-4 py-2 border-t border-white/[0.05]">
                  <p className="text-[12px] text-white/40">
                    Total: {templateItems.reduce((s, f) => s + f.kcal, 0)} kcal ·{' '}
                    {templateItems.reduce((s, f) => s + f.protein, 0).toFixed(1)}g eiwit
                  </p>
                </div>
              </div>
            )}

            {/* Product search */}
            <div className="flex items-center gap-3 h-[46px] px-4 rounded-[12px]"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <Search size={15} className="text-white/40 shrink-0" />
              <input type="text" placeholder="Voeg product toe…" value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
                className="flex-1 bg-transparent text-white placeholder:text-white/30 text-[15px] outline-none" />
            </div>

            <div className="overflow-y-auto flex flex-col rounded-[14px] overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)', maxHeight: '40vh' }}>
              {filteredTemplate.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-white">{p.name}</p>
                    <p className="text-[12px] text-white/40">{Math.round(Number(p.kcal ?? 0))} kcal/100g</p>
                  </div>
                  <input
                    type="number"
                    value={templateGrams[p.id] ?? '100'}
                    onChange={e => setTemplateGrams(prev => ({ ...prev, [p.id]: e.target.value }))}
                    className="w-14 h-8 text-center rounded-[8px] text-white text-[13px] outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  />
                  <span className="text-[12px] text-white/40 w-4">g</span>
                  <button onClick={() => addProductToTemplate(p)}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(45,212,191,0.15)' }}>
                    <Plus size={14} className="text-teal-400" />
                  </button>
                </div>
              ))}
            </div>

            <button onClick={saveTemplate}
              disabled={savingTemplate || !newMealName.trim() || !templateItems.length}
              className="h-[52px] rounded-[16px] bg-white text-black font-semibold text-[16px] disabled:opacity-30">
              {savingTemplate ? 'Saving…' : 'Save Meal Template'}
            </button>
          </div>
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
                  onClick={() => { setSelected(p); setView('detail') }}
                  className="flex items-center justify-between px-4 py-3.5 text-left"
                  style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div>
                    <p className="text-[16px] font-semibold text-white">{p.name}</p>
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
            {/* Amount stepper */}
            <div className="flex items-center justify-between py-4 rounded-[16px] px-4"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <button onClick={() => setGrams(g => String(Math.max(0, Number(g) - 25)))}
                className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-[24px] text-white"
                style={{ background: 'rgba(255,255,255,0.08)' }}>−</button>
              <div className="flex items-baseline gap-1">
                <input type="number" value={grams} onChange={e => setGrams(e.target.value)}
                  className="text-[48px] font-bold text-white bg-transparent text-center outline-none w-28" />
                <span className="text-[22px] text-white/50">g</span>
              </div>
              <button onClick={() => setGrams(g => String(Number(g) + 25))}
                className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-[24px] text-white"
                style={{ background: 'rgba(255,255,255,0.08)' }}>+</button>
            </div>

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
