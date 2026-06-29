import { SWRFallback } from '@/components/SWRFallback'
import { trainingFallback } from '@/lib/server-fallback'
import TrainingTab from './TrainingTab'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const fallback = await trainingFallback()
  return (
    <SWRFallback fallback={fallback}>
      <TrainingTab />
    </SWRFallback>
  )
}
