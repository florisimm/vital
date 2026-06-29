'use client'

import { SWRConfig } from 'swr'

// Seeds the SWR cache with server-fetched data for a route so the first client
// paint already shows the correct screen instead of flashing blank → content.
// Nests under the global SWRProvider, inheriting its localStorage cache provider
// and merging this route's fallback on top.
export function SWRFallback({
  fallback,
  children,
}: {
  fallback: Record<string, unknown>
  children: React.ReactNode
}) {
  return <SWRConfig value={{ fallback }}>{children}</SWRConfig>
}
