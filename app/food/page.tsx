import { PremiumScreen } from '@/components/PremiumScreen'
import { SWRFallback } from '@/components/SWRFallback'
import { foodFallback } from '@/lib/server-fallback'
import { FoodClient } from './FoodClient'

export const dynamic = 'force-dynamic'

export default async function FoodPage() {
  const fallback = await foodFallback()
  return (
    <PremiumScreen title="Food" subtitle="Today's Nutrition">
      <SWRFallback fallback={fallback}>
        <FoodClient />
      </SWRFallback>
    </PremiumScreen>
  )
}
