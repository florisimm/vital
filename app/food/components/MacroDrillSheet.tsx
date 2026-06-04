'use client'

import { cap, MEAL_ORDER, MEAL_LABELS, MEAL_ICONS, type MacroKey, MACRO_LABEL, MACRO_UNIT } from '@/app/food/meal-config'
import type { FoodLogEntry } from '@/lib/types'

export function MacroDrillSheet({ macro, log, onClose }: { macro: MacroKey; log: FoodLogEntry[]; onClose: () => void }) {
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
              <div className="flex items-center justify-between px-1">
                <span className="text-[13px] font-semibold text-white/50 uppercase tracking-wider">
                  {MEAL_ICONS[meal]} {MEAL_LABELS[meal] ?? meal}
                </span>
                <span className="text-[13px] font-semibold text-white/50">
                  {Math.round(groupTotal)}{MACRO_UNIT[macro]}
                </span>
              </div>
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
