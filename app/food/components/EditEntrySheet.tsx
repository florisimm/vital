'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { cap } from '@/app/food/meal-config'
import { ProductDetailView } from './ProductDetailView'
import { createClient } from '@/lib/supabase'
import type { FoodLogEntry, Product } from '@/lib/types'
import type { Targets } from '@/app/food/fetchers'

export function EditEntrySheet({ entry, userId, today, totals, targets, trainingCache, healthCache, onSaved, onClose }: {
  entry: FoodLogEntry
  userId: string
  today: string
  totals: { kcal: number; protein: number; carbs: number; fat: number }
  targets: Targets
  trainingCache: any
  healthCache: any[]
  onSaved: (updated: FoodLogEntry) => void
  onClose: () => void
}) {
  const [meal, setMeal] = useState(entry.meal_category)
  const [servings, setServings] = useState<{ label: string; amount_g: number }[] | undefined>(undefined)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('products')
      .select('servings')
      .eq('user_id', userId)
      .eq('name', entry.food_name)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.servings) setServings(data.servings)
        setReady(true)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const amtG = Number(entry.amount_g) || 100
  const pseudoProduct: Product = {
    name: entry.food_name,
    brand: null,
    kcal:    (Number(entry.kcal    ?? 0) / amtG) * 100,
    protein: (Number(entry.protein ?? 0) / amtG) * 100,
    carbs:   (Number(entry.carbs   ?? 0) / amtG) * 100,
    fat:     (Number(entry.fat     ?? 0) / amtG) * 100,
    servings: servings ?? null,
    image_url: null,
    barcode: null,
  }

  // Subtract the old entry so daily impact shows the correct delta after editing
  const baseTotals = {
    kcal:    Math.max(0, totals.kcal    - Number(entry.kcal    ?? 0)),
    protein: Math.max(0, totals.protein - Number(entry.protein ?? 0)),
    carbs:   Math.max(0, totals.carbs   - Number(entry.carbs   ?? 0)),
    fat:     Math.max(0, totals.fat     - Number(entry.fat     ?? 0)),
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgb(10,12,14)' }}>
      <div className="flex items-center justify-between px-5 shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: '12px' }}>
        <span className="text-[17px] font-bold text-white flex-1 mr-4 truncate">{cap(entry.food_name)}</span>
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <X size={16} className="text-white/70" />
        </button>
      </div>

      {ready && (
        <ProductDetailView
          selected={pseudoProduct}
          meal={meal}
          setMeal={setMeal}
          userId={userId}
          today={today}
          totals={baseTotals}
          targets={targets}
          trainingCache={trainingCache}
          healthCache={healthCache}
          editEntry={entry}
          onSaved={onSaved}
          onAdded={() => {}}
        />
      )}
    </div>
  )
}
