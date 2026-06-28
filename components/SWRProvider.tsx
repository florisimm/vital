'use client'
import { SWRConfig } from 'swr'

const STORAGE_KEY = 'kern-swr-v3'
const LEGACY_STORAGE_KEYS = ['kern-swr-v2']
const TTL_MS = 24 * 60 * 60 * 1000

const PERSIST_KEYS = new Set(['products', 'profile-services'])

let cacheMap: Map<string, any> | null = null

export function saveCache() {
  if (!cacheMap || typeof window === 'undefined') return
  try {
    const entries = [...cacheMap.entries()].filter(([k]) => PERSIST_KEYS.has(k))
    if (entries.length === 0) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), entries }))
  } catch {}
}

function makeProvider() {
  if (typeof window === 'undefined') return new Map()

  let map: Map<string, any>
  try {
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key)
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const { ts, entries } = JSON.parse(raw)
      map = Date.now() - ts < TTL_MS ? new Map(entries) : new Map()
    } else {
      map = new Map()
    }
  } catch {
    map = new Map()
  }

  cacheMap = map

  // visibilitychange fires reliably on iOS when the app goes to background
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveCache()
  })
  // pagehide is the mobile-friendly alternative to beforeunload
  window.addEventListener('pagehide', () => saveCache())
  // Keep beforeunload for desktop
  window.addEventListener('beforeunload', () => saveCache())

  return map
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: makeProvider }}>
      {children}
    </SWRConfig>
  )
}
