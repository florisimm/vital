'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, X } from 'lucide-react'
import { cap } from '@/app/food/meal-config'
import type { Product } from '@/lib/types'
import type { TemplateFoodItem } from '@/app/food/fetchers'

export function CreateMealView({ newMealName, setNewMealName, templateItems, setTemplateItems, products, freqMap, savingTemplate, onSave }: {
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
                  { label: 'Prot', value: `${(Number(pickerProduct.protein??0)*Number(pickerGrams)/100).toFixed(1)}g`,  color: '#2dd4bf' },
                  { label: 'Carbs', value: `${(Number(pickerProduct.carbs??0)*Number(pickerGrams)/100).toFixed(1)}g`,    color: '#facc15' },
                  { label: 'Fat',   value: `${(Number(pickerProduct.fat??0)*Number(pickerGrams)/100).toFixed(1)}g`,      color: '#818cf8' },
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

      <div className="flex flex-col flex-1 px-5 pb-8 gap-4 overflow-y-auto">
        <input type="text" placeholder="Meal name…" value={newMealName}
          onChange={e => setNewMealName(e.target.value)}
          className="h-[46px] px-4 rounded-[12px] text-white placeholder:text-white/30 text-[16px] outline-none font-semibold shrink-0"
          style={{ background: 'rgba(255,255,255,0.08)' }} />

        {templateItems.length > 0 && (
          <div className="flex flex-col rounded-[14px] overflow-hidden shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            {templateItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <button className="flex-1 text-left" onClick={() => {
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
