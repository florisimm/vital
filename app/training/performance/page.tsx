'use client'

import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { PerformanceSection } from '../PerformanceSection'

export default function PerformancePage() {
  return (
    <TrainingDetailScreen title="Metrics" active="Metrics">
      <PerformanceSection />
    </TrainingDetailScreen>
  )
}
