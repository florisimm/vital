export const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

export function getMealForHour(): string {
  const h = new Date().getHours()
  if (h >= 6  && h < 11) return 'ontbijt'
  if (h >= 11 && h < 12) return 'snack_ochtend'
  if (h >= 12 && h < 14) return 'lunch'
  if (h >= 14 && h < 17) return 'snack_middag'
  if (h >= 17 && h < 19) return 'avondeten'
  return 'snack_avond'
}

export function formatDayLabel(dateStr: string) {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  if (dateStr === tomorrow) return 'Tomorrow'
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })
}

export const MEAL_ORDER = ['ontbijt', 'snack_ochtend', 'lunch', 'snack_middag', 'avondeten', 'snack_avond']

export const MEAL_LABELS: Record<string, string> = {
  ontbijt:       'Breakfast',
  snack_ochtend: 'Snacks After Breakfast',
  lunch:         'Lunch',
  snack_middag:  'Snacks After Lunch',
  avondeten:     'Dinner',
  snack_avond:   'Snacks After Dinner',
}

export const MEAL_ICONS: Record<string, string> = {
  ontbijt:       '🌅',
  snack_ochtend: '🍎',
  lunch:         '☀️',
  snack_middag:  '🥗',
  avondeten:     '🌙',
  snack_avond:   '🍿',
}

export const MEAL_LABELS_SHORT: Record<string, string> = {
  ontbijt: 'Breakfast', snack_ochtend: 'Morning', lunch: 'Lunch',
  snack_middag: 'Afternoon', avondeten: 'Dinner', snack_avond: 'Evening',
}

export type MacroKey = 'kcal' | 'protein' | 'carbs' | 'fat'
export const MACRO_LABEL: Record<MacroKey, string> = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' }
export const MACRO_UNIT: Record<MacroKey, string>  = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g' }
