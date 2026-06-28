import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/server-security'
import type { Product } from '@/lib/types'

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1'
const OFN_BASE  = 'https://world.openfoodfacts.org/cgi/search.pl'
const CACHE_TTL_MS = 15 * 60 * 1000
const FAST_CURATED_QUERY_MAX_LENGTH = 4

type SearchProduct = Product & {
  _score: number
  _source: 'recent' | 'curated' | 'local' | 'usda' | 'ofn'
  _generic: boolean
}

type FoodIndexRow = {
  fdc_id: number
  source: string
  name: string
  brand: string | null
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  serving_label: string | null
  serving_amount_g: number | null
}

type CacheEntry = { ts: number; products: Product[] }

type FoodLogRow = {
  food_name: string | null
  brand: string | null
  amount_g: number | null
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  logged_at?: string | null
}

const cache = new Map<string, CacheEntry>()

const CURATED_FOODS: Product[] = [
  { id: 'curated-apple', name: 'Apple', brand: null, kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2, servings: [{ label: '1 medium (182g)', amount_g: 182 }], barcode: null, image_url: null },
  { id: 'curated-banana', name: 'Banana', brand: null, kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3, servings: [{ label: '1 medium (118g)', amount_g: 118 }], barcode: null, image_url: null },
  { id: 'curated-egg', name: 'Egg', brand: null, kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, servings: [{ label: '1 large (50g)', amount_g: 50 }], barcode: null, image_url: null },
  { id: 'curated-chicken-breast', name: 'Chicken breast', brand: null, kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, servings: [{ label: '100g', amount_g: 100 }], barcode: null, image_url: null },
  { id: 'curated-rice-cooked', name: 'Rice, cooked', brand: null, kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, servings: [{ label: '1 cup (158g)', amount_g: 158 }], barcode: null, image_url: null },
  { id: 'curated-oats', name: 'Oats', brand: null, kcal: 389, protein: 16.9, carbs: 66.3, fat: 6.9, servings: [{ label: '40g', amount_g: 40 }], barcode: null, image_url: null },
  { id: 'curated-milk-semi-skimmed', name: 'Milk, semi-skimmed', brand: null, kcal: 47, protein: 3.6, carbs: 4.8, fat: 1.5, servings: [{ label: '250ml', amount_g: 250 }], barcode: null, image_url: null },
  { id: 'curated-avocado', name: 'Avocado', brand: null, kcal: 160, protein: 2, carbs: 8.5, fat: 14.7, servings: [{ label: '1/2 avocado (75g)', amount_g: 75 }], barcode: null, image_url: null },
]

const QUERY_ALIASES: Record<string, string[]> = {
  apple: ['appel'],
  banana: ['banaan'],
  egg: ['ei', 'eieren'],
  'chicken breast': ['kipfilet', 'kip borst'],
  'rice, cooked': ['rijst'],
  oats: ['havermout'],
  'milk, semi-skimmed': ['melk'],
  avocado: ['avocado'],
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(raw|fresh|with skin|without skin|unpeeled|peeled|per 100g|100g|nl|bio|organic)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasQueryMatch(product: Product, q: string): boolean {
  const query = normalizeText(q)
  const haystack = normalizeText(`${product.name} ${product.brand ?? ''}`)
  const aliases = QUERY_ALIASES[product.name.toLowerCase()] ?? []
  return haystack.includes(query)
    || query.split(' ').every(part => haystack.includes(part))
    || aliases.some(alias => normalizeText(alias) === query)
}

function isGenericFood(name: string, brand: string | null): boolean {
  if (brand) return false
  const n = normalizeText(name)
  return !/\b(bar|drink|juice|sauce|pie|chips|cereal|protein|flavour|flavored|snack|candy|yoghurt|yogurt|restaurant)\b/.test(n)
}

function isNoisyLocalName(name: string, q: string): boolean {
  const query = normalizeText(q)
  const firstSegment = name.split(',')[0] ?? ''
  const normalizedFirst = normalizeText(firstSegment)
  const looksLikeChain = /'S\b/i.test(firstSegment) || /^[A-Z0-9&.' -]{4,}$/.test(firstSegment)
  if (!looksLikeChain) return false
  return !query.includes(normalizedFirst)
}

function qualityScore(product: Product): number {
  const kcal = Number(product.kcal ?? 0)
  const protein = Number(product.protein ?? 0)
  const carbs = Number(product.carbs ?? 0)
  const fat = Number(product.fat ?? 0)
  if (kcal <= 0 || kcal > 950) return -100
  if ([protein, carbs, fat].some(v => v < 0 || v > 100)) return -100
  return (protein || carbs || fat) ? 15 : 0
}

function curatedMatches(q: string): SearchProduct[] {
  const query = normalizeText(q)
  return CURATED_FOODS
    .filter(product => {
      const name = normalizeText(product.name)
      const aliases = QUERY_ALIASES[product.name.toLowerCase()] ?? []
      return name.includes(query)
        || query.includes(name)
        || aliases.some(alias => normalizeText(alias).includes(query) || query.includes(normalizeText(alias)))
    })
    .map(product => ({
      ...product,
      _score: 160 + relevance(product.name, product.brand, q),
      _source: 'curated',
      _generic: true,
    } satisfies SearchProduct))
}

function isExactCuratedQuery(q: string): boolean {
  const query = normalizeText(q)
  return CURATED_FOODS.some(product => {
    const name = normalizeText(product.name)
    const aliases = QUERY_ALIASES[product.name.toLowerCase()] ?? []
    return query === name || aliases.some(alias => query === normalizeText(alias))
  })
}

function shouldReturnCuratedOnly(q: string, curated: SearchProduct[]): boolean {
  if (curated.length === 0) return false
  const query = normalizeText(q)
  return isExactCuratedQuery(q) || query.length <= FAST_CURATED_QUERY_MAX_LENGTH
}

function getNutrient(nutrients: any[], ...names: string[]): number {
  for (const name of names) {
    const n = nutrients.find((x: any) =>
      x.nutrientName?.toLowerCase().includes(name.toLowerCase())
    )
    if (n && Number(n.value) > 0) return Math.round(Number(n.value) * 10) / 10
  }
  return 0
}

async function searchUsda(q: string, key: string): Promise<SearchProduct[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1200)
    const res = await fetch(`${USDA_BASE}/foods/search?` + new URLSearchParams({
      query: q, api_key: key,
      dataType: 'Foundation,SR Legacy',
      pageSize: '16', sortBy: 'dataType.keyword', sortOrder: 'asc',
    }), { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = await res.json()
    const products: SearchProduct[] = []
    for (const f of ((data.foods ?? []) as any[])) {
      const n = f.foodNutrients ?? []
      const kcal    = getNutrient(n, 'energy')
      const protein = getNutrient(n, 'protein')
      const carbs   = getNutrient(n, 'carbohydrate')
      const fat     = getNutrient(n, 'total lipid', 'fat')
      if (kcal === 0) continue
      let servings: Product['servings'] = null
      if (f.servingSize && f.servingSizeUnit) {
        const unit = (f.servingSizeUnit as string).toLowerCase()
        const raw  = Number(f.servingSize)
        const g    = unit === 'g' ? raw : unit === 'oz' ? Math.round(raw * 28.35) : unit === 'ml' ? Math.round(raw) : null
        if (g && g > 0) servings = [{ label: `1 serving (${Math.round(g)}g)`, amount_g: Math.round(g) }]
      }
      const product = {
        id: `usda-${f.fdcId}`,
        name: (f.description ?? 'Unknown').trim(),
        brand: null,
        kcal, protein, carbs, fat, servings, barcode: null, image_url: null,
      } satisfies Product
      const searchProduct = {
        ...product,
        _score: relevance(product.name, product.brand, q) + qualityScore(product) + 55,
        _source: 'usda',
        _generic: true,
      } satisfies SearchProduct
      products.push(searchProduct)
    }
    return products
  } catch {
    return []
  }
}

async function searchDutch(q: string): Promise<SearchProduct[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 900)
    const res = await fetch(OFN_BASE + '?' + new URLSearchParams({
      search_terms: q, search_simple: '1', action: 'process', json: '1',
      countries_tags: 'en:netherlands', page_size: '12',
      fields: 'code,product_name,product_name_nl,brands,nutriments,serving_size,serving_quantity,image_url',
    }), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Kern-App/1.0 (health coaching app; floris@joinkern.com)' },
    })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = await res.json()
    const products: SearchProduct[] = []
    for (const [i, p] of ((data.products ?? []) as any[]).entries()) {
      const n = p.nutriments ?? {}
      const kcal    = Math.round(Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0))
      const protein = Math.round(Number(n.proteins_100g ?? 0) * 10) / 10
      const carbs   = Math.round(Number(n.carbohydrates_100g ?? 0) * 10) / 10
      const fat     = Math.round(Number(n.fat_100g ?? 0) * 10) / 10
      if (kcal === 0) continue
      const name  = (p.product_name_nl || p.product_name || '').trim()
      if (!name) continue
      const brand = p.brands?.split(',')[0]?.trim() || null
      const servingQ = p.serving_quantity ? Math.round(Number(p.serving_quantity)) : null
      const servings: Product['servings'] = servingQ && servingQ > 0
        ? [{ label: p.serving_size ?? `${servingQ}g`, amount_g: servingQ }]
        : null
      const product = {
        id: `ofn-${p.code ?? `nl-${i}-${name}`}`,
        name, brand, kcal, protein, carbs, fat, servings,
        barcode: null, image_url: p.image_url ?? null,
      } satisfies Product
      const searchProduct = {
        ...product,
        _score: relevance(product.name, product.brand, q) + qualityScore(product) + (brand ? 0 : 25),
        _source: 'ofn',
        _generic: isGenericFood(product.name, product.brand),
      } satisfies SearchProduct
      products.push(searchProduct)
    }
    return products
  } catch {
    return []
  }
}

async function searchLocalFoodIndex(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, q: string): Promise<SearchProduct[]> {
  const { data, error } = await supabase.rpc('search_food_index', {
    search_query: q,
    max_results: 24,
  })

  if (error || !Array.isArray(data)) {
    if (error && error.code !== 'PGRST202') console.warn('[food-search] local food index skipped:', error.message)
    return []
  }

  return (data as FoodIndexRow[])
    .filter(row => !isNoisyLocalName(row.name, q))
    .map(row => {
    const product: Product = {
      id: `fdc-${row.fdc_id}`,
      name: row.name,
      brand: row.brand,
      kcal: row.kcal,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
      servings: row.serving_label && row.serving_amount_g
        ? [{ label: row.serving_label, amount_g: row.serving_amount_g }]
        : null,
      barcode: null,
      image_url: null,
    }

    return {
      ...product,
      _score: relevance(product.name, product.brand, q) + qualityScore(product) + 90,
      _source: 'local',
      _generic: row.source !== 'branded' && isGenericFood(product.name, product.brand),
    } satisfies SearchProduct
  })
}

async function searchRecentFoods(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, q: string): Promise<SearchProduct[]> {
  const since = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('food_log')
    .select('food_name,brand,amount_g,kcal,protein,carbs,fat,logged_at')
    .gte('date', since)
    .order('logged_at', { ascending: false })
    .limit(300)

  if (error || !Array.isArray(data)) return []

  const groups = new Map<string, {
    name: string
    brand: string | null
    kcals: number[]
    proteins: number[]
    carbs: number[]
    fats: number[]
    count: number
    newestIndex: number
  }>()

  ;(data as FoodLogRow[]).forEach((row, index) => {
    const name = row.food_name?.trim()
    if (!name) return
    const product: Product = {
      id: `recent-${name}-${row.brand ?? ''}`,
      name,
      brand: row.brand || null,
      kcal: null,
      protein: null,
      carbs: null,
      fat: null,
      servings: null,
    }
    if (!hasQueryMatch(product, q)) return

    const grams = Math.max(Number(row.amount_g) || 100, 1)
    const key = `${normalizeText(name)}|${normalizeText(row.brand ?? '')}`
    const current = groups.get(key) ?? {
      name,
      brand: row.brand || null,
      kcals: [],
      proteins: [],
      carbs: [],
      fats: [],
      count: 0,
      newestIndex: index,
    }

    current.kcals.push(Number(row.kcal ?? 0) / grams * 100)
    current.proteins.push(Number(row.protein ?? 0) / grams * 100)
    current.carbs.push(Number(row.carbs ?? 0) / grams * 100)
    current.fats.push(Number(row.fat ?? 0) / grams * 100)
    current.count += 1
    current.newestIndex = Math.min(current.newestIndex, index)
    groups.set(key, current)
  })

  const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

  return [...groups.values()].map(group => {
    const product: Product = {
      id: `recent-${normalizeText(group.name)}-${normalizeText(group.brand ?? '')}`,
      name: group.name,
      brand: group.brand,
      kcal: Math.round(avg(group.kcals)),
      protein: Math.round(avg(group.proteins) * 10) / 10,
      carbs: Math.round(avg(group.carbs) * 10) / 10,
      fat: Math.round(avg(group.fats) * 10) / 10,
      servings: null,
      barcode: null,
      image_url: null,
    }

    return {
      ...product,
      _score: 240 + group.count * 35 + Math.max(0, 30 - group.newestIndex) + relevance(product.name, product.brand, q),
      _source: 'recent',
      _generic: isGenericFood(product.name, product.brand),
    } satisfies SearchProduct
  })
}

function relevance(name: string, brand: string | null, q: string): number {
  const n = name.toLowerCase()
  const ql = q.toLowerCase()
  if (n === ql) return 100
  if (n.startsWith(ql)) return 80
  if (n.split(/\s+/).some(w => w.startsWith(ql))) return 60
  if (n.includes(ql)) return 40
  if ((brand ?? '').toLowerCase().includes(ql)) return 20
  return 0
}

function dedupeAndRank(products: SearchProduct[], q: string): Product[] {
  const query = normalizeText(q)
  const groups = new Map<string, SearchProduct>()

  for (const product of products) {
    if (!hasQueryMatch(product, q)) continue

    const baseName = normalizeText(product.name)
    const key = product._generic
      ? baseName.replace(/\b(cooked|raw|fresh)\b/g, '').trim()
      : `${baseName}|${normalizeText(product.brand ?? '')}`

    const exactBoost = baseName === query ? 40 : baseName.startsWith(query) ? 20 : 0
    const genericBoost = product._generic ? 25 : 0
    const score = product._score + exactBoost + genericBoost
    const candidate = { ...product, _score: score }
    const current = groups.get(key)
    if (!current || candidate._score > current._score) groups.set(key, candidate)
  }

  return [...groups.values()]
    .sort((a, b) => b._score - a._score || a.name.localeCompare(b.name, 'nl'))
    .slice(0, 18)
    .map(({ _score: _score, _source: _source, _generic: _generic, ...product }) => product)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])
  if (q.length > 80) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = rateLimit(`food-search:${user.id}`, 60, 60_000)
  if (limited) return limited

  const cacheKey = normalizeText(q)
  const recent = await searchRecentFoods(supabase, q)
  const cached = cache.get(cacheKey)
  if (recent.length === 0 && cached && Date.now() - cached.ts < CACHE_TTL_MS) return NextResponse.json(cached.products)

  const curated = curatedMatches(q)
  if (shouldReturnCuratedOnly(q, curated)) {
    const merged = dedupeAndRank([...recent, ...curated], q)
    if (recent.length === 0) cache.set(cacheKey, { ts: Date.now(), products: merged })
    return NextResponse.json(merged)
  }

  const key = process.env.USDA_API_KEY
  const local = await searchLocalFoodIndex(supabase, q)
  if (local.length > 0) {
    const merged = dedupeAndRank([...recent, ...curated, ...local], q)
    if (recent.length === 0) cache.set(cacheKey, { ts: Date.now(), products: merged })
    return NextResponse.json(merged)
  }

  if (!key) return NextResponse.json({ error: 'Food search unavailable' }, { status: 503 })
  const externalSearch = Promise.allSettled([searchUsda(q, key), searchDutch(q)])
  const settled = await externalSearch
  const external = settled.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  const merged = dedupeAndRank([...recent, ...curated, ...external], q)

  if (recent.length === 0) cache.set(cacheKey, { ts: Date.now(), products: merged })
  return NextResponse.json(merged)
}
