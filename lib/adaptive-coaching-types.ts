// Type definitions for the adaptive coaching system
// Import from here instead of scattering types across files

// Session feedback captured from user
export type SessionFeedbackLevel = 'easier' | 'about_right' | 'hard' | 'very_hard'

export interface SessionFeedback {
  id: string
  user_id: string
  workout_date: string
  workout_type: 'running' | 'cycling' | 'strength' | 'swimming'
  workout_id: string
  feedback_level: SessionFeedbackLevel
  coach_advice: string | null
  created_at: string
}

// Coach advice override tracking
export interface CoachOverride {
  id: string
  user_id: string
  date: string
  coach_advice: string
  user_action: string
  session_feedback: SessionFeedbackLevel | null
  readiness_score_at_time: number | null
  recovery_score_at_time: number | null
  training_load_at_time: number | null
  session_notes: string | null
  created_at: string
  updated_at: string
}

// Learned coaching adjustments
export interface CoachBiasAdjustment {
  id: string
  user_id: string
  bias_adjustment: number // -0.100 to +0.100
  conservativeness_adjustment: number // -0.100 to +0.100
  reason: string
  data_points_count: number
  calculated_at: string
  updated_at: string
}

// Result of pattern analysis
export interface CoachingAdjustment {
  bias_adjustment: number // -0.100 to +0.100
  conservativeness_adjustment: number // -0.100 to +0.100
  confidence: 'high' | 'medium' | 'low'
  reason: string
  data_points_count: number
}

// Readiness confidence metadata
export interface ReadinessConfidence {
  level: 'high' | 'medium' | 'low'
  reason: string
  data_days: number
}

// Workout record needing feedback
export interface WorkoutToFeedback {
  type: 'running' | 'cycling' | 'strength' | 'swimming'
  id: string
  date: string
  name: string
  startTime: string
}

// Props for feedback UI component
export interface SessionFeedbackProps {
  workoutDate: string
  workoutType: 'running' | 'cycling' | 'strength' | 'swimming'
  workoutId: string
  coachAdvice?: string
  onFeedbackSubmitted?: () => void
}

// API request/response types
export interface SessionFeedbackRequest {
  user_id: string
  workout_date: string
  workout_type: string
  workout_id: string
  feedback_level: SessionFeedbackLevel
  coach_advice?: string
  timestamp: string
}

export interface CoachOverrideRequest {
  date: string
  coach_advice: string
  user_action: string
  readiness_score_at_time: number
  recovery_score_at_time: number
  training_load_at_time: number
}

export interface CoachingAnalysisResult {
  adjustment: CoachingAdjustment | null
  pattern_type: 'conservative' | 'aggressive' | 'none'
  processed_at: string
}
