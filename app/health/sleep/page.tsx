'use client'
import { HealthDetailScreen } from '@/components/HealthDetailScreen'
import { SleepSection } from '../sections'
export default function SleepPage() {
  return <HealthDetailScreen title="Sleep" active="Sleep"><SleepSection /></HealthDetailScreen>
}
