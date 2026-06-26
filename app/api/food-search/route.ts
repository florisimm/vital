import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Product } from '@/lib/types'

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1'

function getNutrient(nutrients: any[], ...names: string[]): number {
  for (const name of names) {
    const n = nutrients.find((x: any) =>
      x.nutrientName?.toLowerCase().includes(name.toLowerCase())
    )
    if (n && Number(n.value) > 0) return Math.round(Number(n.value) * 10) / 10
  }
  return 0
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.USDA_API_KEY
  if (!key) return NextResponse.json({ error: 'USDA_API_KEY not configured' }, { status: 500 })

  let res: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    res = await fetch(`${USDA_BASE}/foods/search?` + new URLSearchParams({
      query: q,
      api_key: key,
      dataType: 'Foundation,SR Legacy,Branded',
      pageSize: '25',
      sortBy: 'dataType.keyword',
      sortOrder: 'asc',
    }), { signal: controller.signal })
    clearTimeout(timeout)
  } catch {
    return NextResponse.json([])
  }

  if (!res.ok) return NextResponse.json([])

  const data = await res.json()

  const foods: Product[] = (data.foods ?? [])
    .map((f: any) => {
      const n = f.foodNutrients ?? []
      const kcal    = getNutrient(n, 'energy')
      const protein = getNutrient(n, 'protein')
      const carbs   = getNutrient(n, 'carbohydrate')
      const fat     = getNutrient(n, 'total lipid', 'fat')

      if (kcal === 0) return null

      const name  = (f.description ?? 'Unknown').trim()
      const brand = f.brandName?.trim() || f.brandOwner?.trim() || null

      let servings: Product['servings'] = null
      if (f.servingSize && f.servingSizeUnit) {
        const unit = (f.servingSizeUnit as string).toLowerCase()
        const raw  = Number(f.servingSize)
        const g    = unit === 'g'   ? raw
                   : unit === 'oz'  ? Math.round(raw * 28.35)
                   : unit === 'ml'  ? Math.round(raw)
                   : null
        if (g && g > 0) {
          servings = [{ label: `1 serving (${Math.round(g)}g)`, amount_g: Math.round(g) }]
        }
      }

      return {
        id: `usda-${f.fdcId}`,
        name,
        brand,
        kcal,
        protein,
        carbs,
        fat,
        servings,
        barcode: null,
        image_url: null,
      } satisfies Product
    })
    .filter(Boolean) as Product[]

  return NextResponse.json(foods)
}
