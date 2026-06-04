'use client'

import { Plus } from 'lucide-react'
import { cap } from '@/app/food/meal-config'
import type { MealTemplate } from '@/app/food/fetchers'

export function MealsListView({ templates, menuOpenId, setMenuOpenId, onNewTemplate, onSelectTemplate, onEditTemplate, onDeleteTemplate }: {
  templates: MealTemplate[]
  menuOpenId: string | null
  setMenuOpenId: (id: string | null) => void
  onNewTemplate: () => void
  onSelectTemplate: (t: MealTemplate) => void
  onEditTemplate: (t: MealTemplate) => void
  onDeleteTemplate: (id: string) => void
}) {
  return (
    <>
      <div className="flex flex-col min-h-0 px-5 pb-8 gap-4">
        <button onClick={onNewTemplate}
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
              const totalKcal    = t.foods.reduce((s, f) => s + f.kcal, 0)
              const totalProtein = t.foods.reduce((s, f) => s + f.protein, 0)
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3.5 rounded-[14px]"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <button className="flex-1 text-left" onClick={() => { setMenuOpenId(null); onSelectTemplate(t) }}>
                    <p className="text-[16px] font-semibold text-white">{cap(t.name)}</p>
                    <p className="text-[12px] text-white/40">
                      {t.foods.length} items · {Math.round(totalKcal)} kcal · {Math.round(totalProtein)}g eiwit
                    </p>
                  </button>
                  <button onClick={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-full">
                    <span className="text-white/40 text-[20px] leading-none tracking-widest">···</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
                  <p className="text-[12px] text-white/40 text-center mt-0.5">
                    {t.foods.length} items · {Math.round(t.foods.reduce((s, f) => s + f.kcal, 0))} kcal
                  </p>
                </div>
                <button onClick={() => onEditTemplate(t)}
                  className="w-full px-4 py-4 text-center text-[17px] text-white border-b border-white/[0.07]">
                  Edit
                </button>
                <button onClick={() => onDeleteTemplate(t.id)}
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
    </>
  )
}
