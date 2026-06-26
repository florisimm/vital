'use client'

import { createClient } from '@/lib/supabase'
import type { FoodLogEntry, Product } from '@/lib/types'

export type Targets = { kcal: number; protein: number; carbs: number; fat: number; goalType: 'cut' | 'maintain' | 'bulk' }

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
      .select('macro_kcal, macro_protein, macro_carbs, macro_fat, training_goal')
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
      goalType: settings?.training_goal === 'lose_weight' ? 'cut'
              : settings?.training_goal === 'build_muscle' ? 'bulk'
              : 'maintain',
    } as Targets,
    userId: user.id,
    today: date,
  }
}

export async function fetchWeeklyNutrition(): Promise<{ avgProtein: number; proteinTarget: number }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { avgProtein: 0, proteinTarget: 0 }
  const from = new Date()
  from.setDate(from.getDate() - 13)
  const [{ data: log }, { data: settings }] = await Promise.all([
    supabase.from('food_log').select('date,protein').eq('user_id', user.id).gte('date', from.toISOString().split('T')[0]),
    supabase.from('user_settings').select('macro_protein').eq('user_id', user.id).single(),
  ])
  const byDay: Record<string, number> = {}
  ;(log ?? []).forEach(r => { byDay[r.date] = (byDay[r.date] ?? 0) + Number(r.protein ?? 0) })
  const days = Object.values(byDay).filter(v => v > 0)
  const avgProtein = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0
  return { avgProtein, proteinTarget: Number(settings?.macro_protein ?? 0) }
}


export type RecentFood = {
  name: string; brand: string | null
  kcal: number; protein: number; carbs: number; fat: number
  count: number
}

export async function fetchRecentFoods(): Promise<RecentFood[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const since = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
  const { data } = await supabase
    .from('food_log')
    .select('food_name, brand, amount_g, kcal, protein, carbs, fat')
    .eq('user_id', user.id)
    .gte('date', since)
    .order('logged_at', { ascending: false })

  const map: Record<string, { name: string; brand: string | null; kcals: number[]; proteins: number[]; carbs: number[]; fats: number[]; count: number }> = {}
  for (const row of data ?? []) {
    const key = (row.food_name ?? '').toLowerCase().trim()
    if (!key) continue
    const g = Math.max(Number(row.amount_g) || 100, 1)
    if (!map[key]) map[key] = { name: row.food_name, brand: row.brand ?? null, kcals: [], proteins: [], carbs: [], fats: [], count: 0 }
    map[key].kcals.push(Number(row.kcal ?? 0) / g * 100)
    map[key].proteins.push(Number(row.protein ?? 0) / g * 100)
    map[key].carbs.push(Number(row.carbs ?? 0) / g * 100)
    map[key].fats.push(Number(row.fat ?? 0) / g * 100)
    map[key].count++
  }
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  return Object.values(map)
    .map(v => ({
      name: v.name, brand: v.brand, count: v.count,
      kcal: Math.round(avg(v.kcals)),
      protein: Math.round(avg(v.proteins) * 10) / 10,
      carbs: Math.round(avg(v.carbs) * 10) / 10,
      fat: Math.round(avg(v.fats) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)
}

export async function fetchCustomFoods(): Promise<Product[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('custom_foods')
    .select('id, name, brand, kcal, protein, carbs, fat, servings')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  return (data ?? []).map(r => ({ ...r, image_url: null, barcode: null })) as Product[]
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
