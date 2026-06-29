import { Suspense } from 'react'
import { SWRFallback } from '@/components/SWRFallback'
import { healthFallback } from '@/lib/server-fallback'
import HealthTab from './HealthTab'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const fallback = await healthFallback()
  return (
    <Suspense>
      <SWRFallback fallback={fallback}>
        <HealthTab />
      </SWRFallback>
    </Suspense>
  )
}
