'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { FoodLogEntry } from '@/lib/types'

export function CustomFoodView({ userId, today, meal, setMeal, onAdded, onClose }: {
  userId: string; today: string; meal: string
  setMeal: (m: string) => void
  onAdded: (e: FoodLogEntry) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({ name: '', brand: '', kcal: '', protein: '', carbs: '', sugars: '', fat: '', caffeine: '', alcohol: '', barcode: '' })
  const [grams, setGrams] = useState('100')
  const [portionG, setPortionG] = useState('')
  const [portionLabel, setPortionLabel] = useState('')
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
    { key: 'kcal',     label: 'Calories',      unit: 'kcal', color: '#fb923c' },
    { key: 'protein',  label: 'Protein',           unit: 'g',    color: '#2dd4bf' },
    { key: 'carbs',    label: 'Carbs',    unit: 'g',    color: '#facc15' },
    { key: 'sugars',   label: 'Sugars', unit: 'g',    color: '#f472b6' },
    { key: 'fat',      label: 'Fat',             unit: 'g',    color: '#818cf8' },
    { key: 'caffeine', label: 'Caffeine',         unit: 'mg',   color: '#a78bfa' },
    { key: 'alcohol',  label: 'Alcohol',         unit: 'g',    color: '#f87171' },
  ]

  return (
    <div className="flex flex-col flex-1 overflow-y-auto px-5 pb-8 gap-4">
      <input type="text" placeholder="Product name *" value={form.name} onChange={e => set('name', e.target.value)}
        className="h-[46px] px-4 rounded-[12px] text-white placeholder:text-white/30 text-[16px] outline-none font-semibold"
        style={{ background: 'rgba(255,255,255,0.08)' }} />
      <input type="text" placeholder="Brand (optional)" value={form.brand} onChange={e => set('brand', e.target.value)}
        className="h-[46px] px-4 rounded-[12px] text-white placeholder:text-white/30 text-[15px] outline-none"
        style={{ background: 'rgba(255,255,255,0.08)' }} />

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

      <p className="text-[12px] font-semibold text-white/40 uppercase tracking-widest -mb-1">Serving size (optional)</p>
      <div className="flex gap-2">
        <input type="text" placeholder="Label (e.g. 1 glass)" value={portionLabel} onChange={e => setPortionLabel(e.target.value)}
          className="flex-1 h-[46px] px-4 rounded-[12px] text-white placeholder:text-white/25 text-[15px] outline-none"
          style={{ background: 'rgba(255,255,255,0.07)' }} />
        <div className="flex items-center gap-1.5 shrink-0">
          <input type="number" inputMode="decimal" placeholder="0" value={portionG} onChange={e => setPortionG(e.target.value)}
            className="w-20 h-[46px] px-3 rounded-[12px] text-white text-[15px] font-semibold outline-none text-right"
            style={{ background: 'rgba(255,255,255,0.07)' }} />
          <span className="text-[13px] text-white/40 pr-1">g</span>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.kcal}
        className="h-[52px] rounded-[16px] bg-white text-black font-semibold text-[16px] disabled:opacity-30">
        {saving ? 'Saving…' : 'Add'}
      </button>
    </div>
  )
}
