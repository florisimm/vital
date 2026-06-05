'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { cap, MEAL_ORDER, MEAL_LABELS, MEAL_ICONS } from '@/app/food/meal-config'
import { createClient } from '@/lib/supabase'
import type { FoodLogEntry } from '@/lib/types'

export function EditFoodSheet({ entry, userId, onSaved, onClose }: {
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

        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <span className="text-[17px] font-bold text-white flex-1 mr-4 truncate">{cap(entry.food_name)}</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X size={16} className="text-white/70" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-8 flex flex-col gap-5">
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
              {preview && (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Kcal',    value: `${preview.kcal}`,      color: '#fb923c' },
                    { label: 'Protein', value: `${preview.protein}g`,  color: '#2dd4bf' },
                    { label: 'Carbs',   value: `${preview.carbs}g`,    color: '#facc15' },
                    { label: 'Fat',     value: `${preview.fat}g`,      color: '#818cf8' },
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
