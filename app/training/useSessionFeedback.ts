// Hook to check if a workout from today has been completed
// and should show the feedback card

import { useMemo } from 'react'
import type { Activity, HevyWorkout } from './sections'

export interface WorkoutToFeedback {
  type: 'running' | 'cycling' | 'strength' | 'swimming'
  id: string
  date: string
  name: string
  startTime: string
}

/**
 * Checks if there are completed workouts today that haven't been
 * given feedback yet. Returns the most recent one if found.
 *
 * Only shows feedback for workouts completed in the last 12 hours.
 */
export function useSessionFeedback(
  activities: Activity[],
  hevy: HevyWorkout[]
): WorkoutToFeedback | null {
  return useMemo(() => {
    const now = Date.now()
    const twelvHoursAgo = now - 12 * 3600000
    const todayStr = new Date().toISOString().slice(0, 10)

    // Check recent Strava activities (last 12 hours)
    const recentActivities = activities.filter((a) => {
      const actTime = new Date(a.start_date).getTime()
      return actTime >= twelvHoursAgo && a.start_date.slice(0, 10) === todayStr
    })

    if (recentActivities.length > 0) {
      const a = recentActivities[0] // Most recent
      let type: 'running' | 'cycling' | 'strength' | 'swimming' = 'running'
      const st = (a.sport_type ?? '').toLowerCase()
      if (st.includes('run')) type = 'running'
      else if (st.includes('ride') || st.includes('cycl')) type = 'cycling'
      else if (st.includes('swim')) type = 'swimming'

      return {
        type,
        id: String(a.id),
        date: todayStr,
        name: a.name,
        startTime: a.start_date,
      }
    }

    // Check recent Hevy workouts (last 12 hours)
    const recentHevy = hevy.filter((h) => {
      const hevyTime = new Date(h.start_time).getTime()
      return hevyTime >= twelvHoursAgo && h.start_time.slice(0, 10) === todayStr
    })

    if (recentHevy.length > 0) {
      const h = recentHevy[0] // Most recent
      return {
        type: 'strength',
        id: h.id,
        date: todayStr,
        name: h.title,
        startTime: h.start_time,
      }
    }

    return null
  }, [activities, hevy])
}
