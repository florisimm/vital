import { PremiumScreen } from '@/components/PremiumScreen'
import { FoodClient } from './FoodClient'

export default function FoodPage() {
  return (
    <PremiumScreen title="Food" subtitle="Today's Nutrition">
      <FoodClient />
    </PremiumScreen>
  )
}
