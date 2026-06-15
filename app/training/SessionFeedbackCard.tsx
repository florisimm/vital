'use client'

import { useState } from 'react'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase'

export type SessionFeedbackLevel = 'easier' | 'about_right' | 'hard' | 'very_hard'

export interface SessionFeedbackProps {
  /** Date of the workout (YYYY-MM-DD) */
  workoutDate: string
  /** Type of workout: 'running', 'cycling', 'strength', 'swimming' */
  workoutType: 'running' | 'cycling' | 'strength' | 'swimming'
  /** Unique workout identifier (strava activity id or hevy workout id) */
  workoutId: string
  /** Optional: coach advice that was given for this session */
  coachAdvice?: string
  /** Called when feedback is submitted */
  onFeedbackSubmitted?: () => void
}

export function SessionFeedbackCard({
  workoutDate,
  workoutType,
  workoutId,
  coachAdvice,
  onFeedbackSubmitted,
}: SessionFeedbackProps) {
  const [selectedFeedback, setSelectedFeedback] = useState<SessionFeedbackLevel | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const feedbackOptions: Array<{
    key: SessionFeedbackLevel
    label: string
    description: string
    color: string
  }> = [
    {
      key: 'easier',
      label: 'Easier than expected',
      description: 'Could have done more',
      color: 'text-emerald-400',
    },
    {
      key: 'about_right',
      label: 'About right',
      description: 'Well-matched intensity',
      color: 'text-teal-400',
    },
    {
      key: 'hard',
      label: 'Hard',
      description: 'Challenging but manageable',
      color: 'text-yellow-400',
    },
    {
      key: 'very_hard',
      label: 'Very hard',
      description: 'Pushed to limits',
      color: 'text-orange-400',
    },
  ]

  const handleSubmit = async (feedback: SessionFeedbackLevel) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const response = await fetch('/api/training/session-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          workout_date: workoutDate,
          workout_type: workoutType,
          workout_id: workoutId,
          feedback_level: feedback,
          coach_advice: coachAdvice,
          timestamp: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to submit feedback')
      }

      setSelectedFeedback(feedback)
      setSubmitted(true)
      onFeedbackSubmitted?.()

      // Auto-hide after 2 seconds
      setTimeout(() => {
        setSubmitted(false)
        setSelectedFeedback(null)
      }, 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('Feedback submission error:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-2">
          <span className="text-[14px] text-white/50">Thanks for the feedback!</span>
          <span className="text-[13px] text-white/30">This helps us improve your coaching</span>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">
            How was that workout?
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {feedbackOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => handleSubmit(option.key)}
              disabled={isSubmitting}
              className={`p-3 rounded-lg transition-all flex flex-col gap-1 text-left ${
                selectedFeedback === option.key
                  ? 'ring-2 ring-white/20 bg-white/10'
                  : 'bg-white/5 hover:bg-white/8 active:bg-white/12'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className={`text-[13px] font-semibold text-white ${option.color}`}>
                {option.label}
              </span>
              <span className="text-[11px] text-white/40">{option.description}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="text-[12px] text-red-400">{error}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
