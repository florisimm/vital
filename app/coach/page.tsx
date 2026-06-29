import { SWRFallback } from '@/components/SWRFallback'
import { coachFallback } from '@/lib/server-fallback'
import CoachTab from './CoachTab'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const fallback = await coachFallback()
  return (
    <SWRFallback fallback={fallback}>
      <CoachTab />
    </SWRFallback>
  )
}
