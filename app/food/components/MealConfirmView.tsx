'use client'

import { cap, MEAL_ORDER, MEAL_LABELS, MEAL_ICONS } from '@/app/food/meal-config'
import type { MealTemplate } from '@/app/food/fetchers'

export function MealConfirmView({ template, meal, setMeal, loggingTemplate, onLog }: {
  template: MealTemplate
  meal: string
  setMeal: (m: string) => void
  loggingTemplate: boolean
  onLog: () => void
}) {
  return (
    <div className="flex flex-col flex-1 px-5 pb-8 gap-5 overflow-y-auto">
      <div className="rounded-[18px] px-5 py-5 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <p className="text-[22px] font-bold text-white">{cap(template.name)}</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Kcal',   value: `${Math.round(template.foods.reduce((s, f) => s + f.kcal, 0))}`,       color: '#fb923c' },
            { label: 'Eiwit',  value: `${Math.round(template.foods.reduce((s, f) => s + f.protein, 0))}g`,   color: '#2dd4bf' },
            { label: 'Koolh.', value: `${Math.round(template.foods.reduce((s, f) => s + f.carbs, 0))}g`,     color: '#facc15' },
            { label: 'Vet',    value: `${Math.round(template.foods.reduce((s, f) => s + f.fat, 0))}g`,       color: '#818cf8' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center gap-1 py-3 rounded-[14px]"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <span className="text-[17px] font-bold" style={{ color }}>{value}</span>
              <span className="text-[11px] text-white/40">{label}</span>
            </div>
          ))}
        </div>
      </div>

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

      <button onClick={onLog} disabled={loggingTemplate}
        className="h-[54px] rounded-[18px] bg-white text-black font-semibold text-[17px] disabled:opacity-40 shrink-0">
        {loggingTemplate ? 'Adding…' : `Add to ${MEAL_LABELS[meal] ?? meal}`}
      </button>
    </div>
  )
}
