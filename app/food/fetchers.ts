'use client'

import { createClient } from '@/lib/supabase'
import type { FoodLogEntry, Product } from '@/lib/types'

export type Targets = { kcal: number; protein: number; carbs: number; fat: number }

export type MealTemplate = {
  id: string; name: string; description: string | null
  foods: TemplateFoodItem[]
}

export type TemplateFoodItem = {
  food_name: string; brand: string | null; amount_g: number
  kcal: number; protein: number; carbs: number; fat: number
}

export async function fetchFoodData(date: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const [{ data: foodLog }, { data: settings }] = await Promise.all([
    supabase
      .from('food_log')
      .select('id, meal_category, food_name, amount_g, kcal, protein, carbs, fat, logged_at')
      .eq('user_id', user.id)
      .eq('date', date)
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
      kcal:    Number(settings?.macro_kcal    ?? 2500),
      protein: Number(settings?.macro_protein ?? 180),
      carbs:   Number(settings?.macro_carbs   ?? 250),
      fat:     Number(settings?.macro_fat     ?? 80),
    } as Targets,
    userId: user.id,
    today: date,
  }
}

export async function fetchProducts(): Promise<Product[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('products')
    .select('id, name, brand, kcal, protein, carbs, fat, servings, barcode, image_url')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order('name')
  return (data ?? []) as Product[]
}

export async function fetchMealTemplates(): Promise<MealTemplate[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('meal_templates')
    .select('id,name,description,foods')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  return (data ?? []).map(r => ({
    id: r.id, name: r.name, description: r.description,
    foods: Array.isArray(r.foods) ? r.foods : [],
  }))
}

export async function fetchFoodFrequency(): Promise<Record<string, number>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const since = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
  const { data } = await supabase
    .from('food_log')
    .select('food_name')
    .eq('user_id', user.id)
    .gte('date', since)
  const freq: Record<string, number> = {}
  for (const row of data ?? []) {
    const key = (row.food_name ?? '').toLowerCase()
    freq[key] = (freq[key] ?? 0) + 1
  }
  return freq
}
