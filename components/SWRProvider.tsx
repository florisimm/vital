'use client'
import { SWRConfig } from 'swr'

const STORAGE_KEY = 'kern-swr-v1'
const TTL_MS = 24 * 60 * 60 * 1000

const PERSIST_KEYS = new Set(['today', 'training', 'health-gezondheid', 'food-log', 'products'])

function makeProvider() {
  if (typeof window === 'undefined') return new Map()

  let map: Map<string, any>
  try {
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

  window.addEventListener('beforeunload', () => {
    try {
      const entries = [...map.entries()].filter(([k]) => PERSIST_KEYS.has(k))
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), entries }))
    } catch {}
  })

  return map
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: makeProvider }}>
      {children}
    </SWRConfig>
  )
}
