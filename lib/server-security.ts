import { NextResponse } from 'next/server'

type RateEntry = { count: number; resetAt: number }

const buckets = new Map<string, RateEntry>()

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  const site = req.headers.get('sec-fetch-site')
  if (site === 'cross-site') return false
  if (!origin) return true

  try {
    return new URL(origin).origin === new URL(req.url).origin
  } catch {
    return false
  }
}

export function rejectCrossOrigin(req: Request) {
  if (sameOrigin(req)) return null
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  current.count += 1
  if (current.count <= limit) return null

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}

export async function readJsonLimited<T = unknown>(req: Request, maxBytes = 64_000): Promise<T | null> {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > maxBytes) return null
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}

