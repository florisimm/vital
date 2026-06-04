'use client'

import { Plus, Trash2 } from 'lucide-react'
import { cap } from '@/app/food/meal-config'
import type { FoodLogEntry } from '@/lib/types'

export function MealSection({ meal, icon, label, entries, onDelete, onEdit, onAdd }: {
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
