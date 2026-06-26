import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Product } from '@/lib/types'

const OFN_BASE = 'https://world.openfoodfacts.org/api/v0/product'
const OFN_TIMEOUT_MS = 6000

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const barcode = searchParams.get('barcode')?.trim()

  if (!barcode || barcode.length < 4 || barcode.length > 50 || /\s/.test(barcode)) {
    return NextResponse.json({ error: 'Invalid barcode' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch from Open Food Facts
  let ofnData: Record<string, unknown>
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), OFN_TIMEOUT_MS)
    const res = await fetch(`${OFN_BASE}/${encodeURIComponent(barcode)}.json`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Kern-App/1.0 (health coaching app)' },
    })
    clearTimeout(timeout)
    ofnData = await res.json() as Record<string, unknown>
  } catch (err: unknown) {
    const isTimeout = (err as { name?: string })?.name === 'AbortError'
    return NextResponse.json(
      { error: isTimeout ? 'Open Food Facts request timed out' : 'Open Food Facts unreachable' },
      { status: 502 },
    )
  }

  if (ofnData.status !== 1 || !ofnData.product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Parse the OFN response
  const p = ofnData.product as Record<string, unknown>
  const n = (p.nutriments ?? {}) as Record<string, unknown>

  const rawName = (p.product_name_en || p.product_name || p.product_name_nl || '') as string
  const name = rawName.trim() || 'Unknown product'
  const rawBrand = (p.brands as string | undefined)?.split(',')[0].trim()
  const brand = rawBrand || null
  const image_url = (p.image_front_url || p.image_url || null) as string | null

  const kcal     = Math.round(Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0))
  const protein  = Math.round(Number(n.proteins_100g ?? 0) * 10) / 10
  const carbs    = Math.round(Number(n.carbohydrates_100g ?? 0) * 10) / 10
  const fat      = Math.round(Number(n.fat_100g ?? 0) * 10) / 10
  const caffeineRaw = Number(n.caffeine_100g ?? 0)
  const caffeine = caffeineRaw > 0 ? Math.round(caffeineRaw * 10) / 10 : null

  const servingQ     = p.serving_quantity ? Math.round(Number(p.serving_quantity)) : null
  const servingLabel = (p.serving_size as string | undefined) ?? (servingQ ? `${servingQ}g` : null)
  const servings: Product['servings'] =
    servingQ && servingLabel ? [{ label: servingLabel, amount_g: servingQ }] : null

  const product: Product = { id: `ofn-${barcode}`, name, brand, kcal, protein, carbs, fat, servings, image_url }
  return NextResponse.json(product)
}
