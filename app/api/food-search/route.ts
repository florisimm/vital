import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Product } from '@/lib/types'

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1'
const OFN_BASE  = 'https://world.openfoodfacts.org/cgi/search.pl'

function getNutrient(nutrients: any[], ...names: string[]): number {
  for (const name of names) {
    const n = nutrients.find((x: any) =>
      x.nutrientName?.toLowerCase().includes(name.toLowerCase())
    )
    if (n && Number(n.value) > 0) return Math.round(Number(n.value) * 10) / 10
  }
  return 0
}

async function searchUsda(q: string, key: string): Promise<Product[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(`${USDA_BASE}/foods/search?` + new URLSearchParams({
      query: q, api_key: key,
      dataType: 'Foundation,SR Legacy,Branded',
      pageSize: '20', sortBy: 'dataType.keyword', sortOrder: 'asc',
    }), { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = await res.json()
    return (data.foods ?? []).map((f: any) => {
      const n = f.foodNutrients ?? []
      const kcal    = getNutrient(n, 'energy')
      const protein = getNutrient(n, 'protein')
      const carbs   = getNutrient(n, 'carbohydrate')
      const fat     = getNutrient(n, 'total lipid', 'fat')
      if (kcal === 0) return null
      let servings: Product['servings'] = null
      if (f.servingSize && f.servingSizeUnit) {
        const unit = (f.servingSizeUnit as string).toLowerCase()
        const raw  = Number(f.servingSize)
        const g    = unit === 'g' ? raw : unit === 'oz' ? Math.round(raw * 28.35) : unit === 'ml' ? Math.round(raw) : null
        if (g && g > 0) servings = [{ label: `1 serving (${Math.round(g)}g)`, amount_g: Math.round(g) }]
      }
      return {
        id: `usda-${f.fdcId}`,
        name: (f.description ?? 'Unknown').trim(),
        brand: f.brandName?.trim() || f.brandOwner?.trim() || null,
        kcal, protein, carbs, fat, servings, barcode: null, image_url: null,
      } satisfies Product
    }).filter(Boolean) as Product[]
  } catch {
    return []
  }
}

async function searchDutch(q: string): Promise<Product[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(OFN_BASE + '?' + new URLSearchParams({
      search_terms: q, search_simple: '1', action: 'process', json: '1',
      countries_tags: 'en:netherlands', page_size: '20',
      fields: 'product_name,product_name_nl,brands,nutriments,serving_size,serving_quantity,image_url',
    }), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Kern-App/1.0 (health coaching app; floris@joinkern.com)' },
    })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = await res.json()
    return ((data.products ?? []) as any[]).map((p, i) => {
      const n = p.nutriments ?? {}
      const kcal    = Math.round(Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0))
      const protein = Math.round(Number(n.proteins_100g ?? 0) * 10) / 10
      const carbs   = Math.round(Number(n.carbohydrates_100g ?? 0) * 10) / 10
      const fat     = Math.round(Number(n.fat_100g ?? 0) * 10) / 10
      if (kcal === 0) return null
      const name  = (p.product_name_nl || p.product_name || '').trim()
      if (!name) return null
      const brand = p.brands?.split(',')[0]?.trim() || null
      const servingQ = p.serving_quantity ? Math.round(Number(p.serving_quantity)) : null
      const servings: Product['servings'] = servingQ && servingQ > 0
        ? [{ label: p.serving_size ?? `${servingQ}g`, amount_g: servingQ }]
        : null
      return {
        id: `ofn-nl-${i}-${name}`,
        name, brand, kcal, protein, carbs, fat, servings,
        barcode: null, image_url: p.image_url ?? null,
      } satisfies Product
    }).filter(Boolean) as Product[]
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ international: [], dutch: [] })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.USDA_API_KEY
  if (!key) return NextResponse.json({ error: 'USDA_API_KEY not configured' }, { status: 500 })

  const [international, dutch] = await Promise.all([searchUsda(q, key), searchDutch(q)])

  return NextResponse.json({ international, dutch })
}
