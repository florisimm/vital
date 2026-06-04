export type FoodLogEntry = {
  id: string
  meal_category: string
  food_name: string
  amount_g: number | null
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  logged_at: string
}

export type Product = {
  id: string
  name: string
  brand: string | null
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  servings: { label: string; amount_g: number }[] | null
  barcode?: string | null
  image_url?: string | null
}
