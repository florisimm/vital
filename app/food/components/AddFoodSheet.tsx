'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Plus, ChevronRight, Search, Utensils, ScanLine } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { BarcodeScanner } from '@/components/BarcodeScanner'
import type { FoodLogEntry, Product } from '@/lib/types'
import {
  fetchMealTemplates,
  type Targets, type MealTemplate, type TemplateFoodItem, type RecentFood,
} from '@/app/food/fetchers'
import { cap } from '@/app/food/meal-config'
import { CustomFoodView } from './CustomFoodView'
import { CreateMealView } from './CreateMealView'
import { ProductDetailView } from './ProductDetailView'
import { MealConfirmView } from './MealConfirmView'
import { ScanResultView } from './ScanResultView'
import { MealsListView } from './MealsListView'

type SheetView = 'options' | 'search' | 'detail' | 'scan' | 'meals' | 'create-meal' | 'meal-confirm' | 'custom-food'

export function AddFoodSheet({ customFoods, recentFoods, preselectedMeal, userId, today, totals, targets, onAdded, onClose }: {
  customFoods: Product[]; recentFoods: RecentFood[]
  preselectedMeal: string; userId: string; today: string
  totals: { kcal: number; protein: number; carbs: number; fat: number }
  targets: Targets
  onAdded: (entry: FoodLogEntry) => void; onClose: () => void
}) {
  const [view, setView] = useState<SheetView>('options')
  const [viewHistory, setViewHistory] = useState<SheetView[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [meal, setMeal] = useState(preselectedMeal)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeError, setBarcodeError] = useState<'not_found' | 'invalid' | 'unreachable' | null>(null)

  const { data: trainingCache } = useSWR('training', null, { revalidateOnMount: false, revalidateOnFocus: false })
  const { data: healthCache } = useSWR<any[]>('health-gezondheid', null, { revalidateOnMount: false, revalidateOnFocus: false })
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: templates = [], mutate: mutateTemplates } = useSWR('meal-templates', fetchMealTemplates, { revalidateOnFocus: false })
  const [newMealName, setNewMealName] = useState('')
  const [templateItems, setTemplateItems] = useState<TemplateFoodItem[]>([])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [confirmTemplate, setConfirmTemplate] = useState<MealTemplate | null>(null)
  const [loggingTemplate, setLoggingTemplate] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const q = search.trim()
    if (q.length < 2 || view !== 'search') { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/food-search?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const results: Product[] = await res.json()
          // Boost results the user has logged before to the top
          const ql = q.toLowerCase()
          const boosted = results
            .map(p => {
              const freq = recentFoods.find(r => r.name.toLowerCase() === p.name.toLowerCase())?.count ?? 0
              const nameMatch = p.name.toLowerCase().startsWith(ql) ? 2 : p.name.toLowerCase().includes(ql) ? 1 : 0
              return { p, score: freq * 10 + nameMatch }
            })
            .sort((a, b) => b.score - a.score)
            .map(x => x.p)
          setSearchResults(boosted)
        }
      } catch { /* ignore */ } finally {
        setSearchLoading(false)
      }
    }, 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search, view])

  function handleSelectRemote(product: Product) {
    setSelected(product)
    navigate('detail')
  }

  function navigate(next: SheetView) {
    setViewHistory(h => [...h, view])
    setView(next)
  }

  function resetTo(next: SheetView) {
    setViewHistory([])
    setView(next)
  }

  function handleBack() {
    if (view === 'detail') setSelected(null)
    if (view === 'create-meal') { setTemplateItems([]); setNewMealName('') }
    if (view === 'meal-confirm') setConfirmTemplate(null)
    const prev = viewHistory[viewHistory.length - 1]
    if (prev === undefined) { onClose(); return }
    setViewHistory(h => h.slice(0, -1))
    setView(prev)
  }

  async function handleBarcodeDetected(barcode: string) {
    setShowBarcodeScanner(false)
    setBarcodeLoading(true)
    setBarcodeError(null)
    navigate('scan')
    try {
      const res = await fetch(`/api/barcode-lookup?barcode=${encodeURIComponent(barcode)}`)
      if (res.status === 404) { setBarcodeError('not_found'); return }
      if (res.status === 400) { setBarcodeError('invalid'); return }
      if (!res.ok)            { setBarcodeError('unreachable'); return }
      const product = await res.json() as Product
      setSelected(product)
      setView('detail')
    } finally {
      setBarcodeLoading(false)
    }
  }

  async function logTemplate() {
    if (!confirmTemplate?.foods.length || loggingTemplate) return
    setLoggingTemplate(true)
    try {
      const supabase = createClient()
      await supabase.from('food_log').insert({
        user_id: userId, date: today, meal_category: meal,
        food_name: confirmTemplate.name, amount_g: null,
        kcal:    Math.round(confirmTemplate.foods.reduce((s, f) => s + f.kcal, 0)),
        protein: Math.round(confirmTemplate.foods.reduce((s, f) => s + f.protein, 0) * 10) / 10,
        carbs:   Math.round(confirmTemplate.foods.reduce((s, f) => s + f.carbs, 0) * 10) / 10,
        fat:     Math.round(confirmTemplate.foods.reduce((s, f) => s + f.fat, 0) * 10) / 10,
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
      await supabase.from('meal_templates').update({ name: newMealName.trim(), foods: templateItems }).eq('id', confirmTemplate.id)
    } else {
      await supabase.from('meal_templates').insert({ user_id: userId, name: newMealName.trim(), foods: templateItems })
    }
    setSavingTemplate(false)
    mutateTemplates()
    setTemplateItems([]); setNewMealName(''); setConfirmTemplate(null)
    resetTo('meals')
  }

  async function deleteTemplate(id: string) {
    const supabase = createClient()
    await supabase.from('meal_templates').delete().eq('id', id)
    mutateTemplates()
  }

  const sheetTitle = view === 'options' ? 'Add Food'
    : view === 'search'       ? 'Search Food'
    : view === 'scan'         ? 'Scan Barcode'
    : view === 'meals'        ? 'Meals'
    : view === 'meal-confirm' ? (confirmTemplate?.name ?? 'Meal')
    : view === 'create-meal'  ? (confirmTemplate ? 'Edit meal' : 'New meal')
    : view === 'custom-food'  ? 'Custom Food'
    : 'Add Food'

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="relative flex flex-col flex-1 overflow-hidden"
        style={{ background: 'rgb(10, 12, 14)', overscrollBehavior: 'contain' }}
        onClick={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 pb-4 shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
          {view !== 'options'
            ? <button onClick={handleBack} className="text-[17px] font-medium text-white/70 w-16">‹ Back</button>
            : <div className="w-16" />}
          <span className="text-[17px] font-bold text-white">{sheetTitle}</span>
          <button onClick={onClose} className="text-[17px] font-medium text-white/70 w-16 text-right">Cancel</button>
        </div>

        {showBarcodeScanner && (
          <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowBarcodeScanner(false)} />
        )}

        {view === 'options' && (
          <div className="px-5 pb-10 flex flex-col gap-2">
            <div className="rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {[
                { Icon: Search,   iconBg: '#22d3ee', label: 'Search Food',  sub: 'Find in nutrition database',       action: () => navigate('search') },
                { Icon: Utensils, iconBg: '#4ade80', label: 'Meals',        sub: 'Log a saved meal template',        action: () => navigate('meals') },
                { Icon: ScanLine, iconBg: '#fb923c', label: 'Scan Barcode', sub: 'Scan product barcode',             action: () => setShowBarcodeScanner(true) },
                { Icon: Plus,     iconBg: '#a78bfa', label: 'Custom Food',  sub: 'Enter nutrition details manually', action: () => navigate('custom-food') },
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

        {view === 'scan' && (
          <ScanResultView
            barcodeLoading={barcodeLoading}
            barcodeError={barcodeError}
            onCustomFood={() => navigate('custom-food')}
            onRescan={() => { setBarcodeError(null); setShowBarcodeScanner(true) }}
            onSearch={() => navigate('search')}
          />
        )}

        {view === 'meals' && (
          <MealsListView
            templates={templates}
            menuOpenId={menuOpenId}
            setMenuOpenId={setMenuOpenId}
            onNewTemplate={() => { setTemplateItems([]); setNewMealName(''); navigate('create-meal') }}
            onSelectTemplate={(t) => { setConfirmTemplate(t); navigate('meal-confirm') }}
            onEditTemplate={(t) => { setMenuOpenId(null); setConfirmTemplate(t); setNewMealName(t.name); setTemplateItems(t.foods); navigate('create-meal') }}
            onDeleteTemplate={(id) => { setMenuOpenId(null); deleteTemplate(id) }}
          />
        )}

        {view === 'meal-confirm' && confirmTemplate && (
          <MealConfirmView
            template={confirmTemplate}
            meal={meal}
            setMeal={setMeal}
            loggingTemplate={loggingTemplate}
            onLog={logTemplate}
          />
        )}

        {view === 'create-meal' && (
          <CreateMealView
            newMealName={newMealName}
            setNewMealName={setNewMealName}
            templateItems={templateItems}
            setTemplateItems={setTemplateItems}
            savingTemplate={savingTemplate}
            onSave={saveTemplate}
          />
        )}

        {view === 'custom-food' && (
          <CustomFoodView userId={userId} today={today} meal={meal} setMeal={setMeal} onAdded={onAdded} onClose={onClose} />
        )}

        {view === 'search' && (
          <div className="flex flex-col flex-1 min-h-0 px-5 pb-8 gap-3">
            <div className="flex items-center gap-3 h-[46px] px-4 rounded-[12px] shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <Search size={16} className="text-white/40 shrink-0" />
              <input type="text" placeholder="Search food…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-white placeholder:text-white/30 text-[16px] outline-none" />
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-3">
              {/* Custom foods — instant, filtered by query */}
              {(() => {
                const q = search.trim().toLowerCase()
                const matches = q
                  ? customFoods.filter(p => p.name.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q))
                  : customFoods
                if (matches.length === 0) return null
                return (
                  <>
                    <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest px-1">My food</p>
                    <div className="flex flex-col rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      {matches.map((p, i) => (
                        <button key={p.id} onClick={() => { setSelected(p); navigate('detail') }}
                          className="flex items-center justify-between px-4 py-3.5 text-left"
                          style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[16px] font-semibold text-white truncate">{cap(p.name)}</p>
                            {p.brand && <p className="text-[12px] text-white/40">{p.brand}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="text-[14px] font-semibold text-orange-400">{Math.round(Number(p.kcal ?? 0))} kcal</span>
                            <ChevronRight size={14} className="text-white/20" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )
              })()}

              {search.trim().length >= 2 && (
                searchLoading ? (
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="animate-pulse h-[58px] rounded-[14px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
                    ))}
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="flex flex-col rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    {searchResults.map((p, i) => (
                      <button key={p.id} onClick={() => handleSelectRemote(p)}
                        className="flex items-center justify-between px-4 py-3.5 text-left"
                        style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[16px] font-semibold text-white truncate">{cap(p.name)}</p>
                          {p.brand && <p className="text-[12px] text-white/40">{p.brand}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className="text-[14px] font-semibold text-orange-400">{Math.round(Number(p.kcal ?? 0))} kcal</span>
                          <ChevronRight size={14} className="text-white/20" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-5 text-[14px] text-white/30 text-center">No results for "{search}"</p>
                )
              )}

              {search.trim().length < 2 && recentFoods.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest px-1 shrink-0">Vaak gebruikt</p>
                  <div className="flex flex-col rounded-[16px] overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    {recentFoods.map((f, i) => {
                      const p: Product = { id: `recent-${f.name}`, name: f.name, brand: f.brand, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, servings: null, image_url: null, barcode: null }
                      return (
                        <button key={i} onClick={() => { setSelected(p); navigate('detail') }}
                          className="flex items-center justify-between px-4 py-3.5 text-left"
                          style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[16px] font-semibold text-white truncate">{cap(f.name)}</p>
                            {f.brand && <p className="text-[12px] text-white/40">{f.brand}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="text-[14px] font-semibold text-orange-400">{f.kcal} kcal</span>
                            <ChevronRight size={14} className="text-white/20" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              {search.trim().length < 2 && recentFoods.length === 0 && customFoods.length === 0 && (
                <p className="px-4 py-5 text-[14px] text-white/30 text-center">Typ om te zoeken…</p>
              )}
            </div>
          </div>
        )}

        {view === 'detail' && selected && (
          <ProductDetailView
            key={selected.id}
            selected={selected}
            meal={meal}
            setMeal={setMeal}
            userId={userId}
            today={today}
            totals={totals}
            targets={targets}
            trainingCache={trainingCache}
            healthCache={healthCache ?? []}
            onAdded={onAdded}
          />
        )}

        {view === 'options' && <div />}
      </div>
    </div>
  )
}
