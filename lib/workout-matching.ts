type StrengthWorkout = {
  title?: string | null
  name?: string | null
}

type CardioActivity = {
  sport_type?: string | null
}

export type CompletedWorkout = {
  name?: string | null
  title?: string | null
  sport?: string | null
}

const STRENGTH_KEYWORDS = [
  'pull', 'push', 'legs', 'leg', 'chest', 'back', 'squat', 'gym', 'strength',
  'deadlift', 'bench', 'bicep', 'tricep', 'shoulder', 'upper', 'lower',
  'weights', 'kracht', 'fitness', 'gewichten',
]

const CARDIO_TITLE_KEYWORDS = [
  'run', 'long run', 'bike', 'swim', 'ride', 'cycling', 'cycle', 'interval',
  'tempo', 'zone', 'loop', 'hardloop', 'fiet', 'zwem',
]

const CARDIO_SPORT_KEYWORDS = [
  'run', 'ride', 'swim', 'walk', 'hike', 'virtual_run', 'virtual_ride',
  'rowing', 'kayaking', 'elliptical', 'cycl',
]

const GENERIC_STRENGTH_WORDS = new Set([
  'gym', 'strength', 'training', 'workout', 'kracht', 'fitness', 'weights',
  'weight', 'gewichten', 'session', 'sessie',
])

const STRENGTH_STOP_WORDS = new Set([
  'day', 'dag', 'recommended', 'today', 'training', 'workout', 'session',
  'sessie', 'planned', 'plan', 'done', 'completed', 'voltooid',
])

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function workoutName(workout: StrengthWorkout): string {
  return workout.title ?? workout.name ?? ''
}

export function isStrengthTitle(title: string): boolean {
  const normalized = normalizeText(title)
  return STRENGTH_KEYWORDS.some(keyword => normalized.split(' ').includes(keyword))
}

export function isCardioTitle(title: string): boolean {
  const normalized = normalizeText(title)
  return CARDIO_TITLE_KEYWORDS.some(keyword => normalized.includes(keyword))
}

export function isCardioSport(sport: string | null | undefined): boolean {
  const normalized = normalizeText(sport ?? '')
  return CARDIO_SPORT_KEYWORDS.some(keyword => normalized.includes(keyword))
}

export function isGenericStrengthTitle(title: string): boolean {
  const tokens = normalizeText(title).split(' ').filter(Boolean)
  return tokens.length > 0 && tokens.every(token => GENERIC_STRENGTH_WORDS.has(token))
}

export function normalizeStrengthSessionTitle(title: string): string {
  return normalizeText(title)
    .split(' ')
    .filter(token => token && !STRENGTH_STOP_WORDS.has(token))
    .join(' ')
}

export function strengthSessionMatches(plannedTitle: string, completedTitle: string): boolean {
  if (!plannedTitle || !completedTitle) return false
  if (isGenericStrengthTitle(plannedTitle)) return isStrengthTitle(completedTitle) || normalizeText(completedTitle).length > 0
  const planned = normalizeStrengthSessionTitle(plannedTitle)
  const completed = normalizeStrengthSessionTitle(completedTitle)
  return planned.length > 0 && planned === completed
}

export function completedStrengthWorkoutsForPlan<T extends StrengthWorkout>(plannedTitle: string, workouts: T[]): T[] {
  return workouts.filter(workout => strengthSessionMatches(plannedTitle, workoutName(workout)))
}

export function hasCompletedPlannedWorkout(
  plannedTitle: string,
  strengthWorkouts: StrengthWorkout[],
  cardioActivities: CardioActivity[],
): boolean {
  const strengthPlan = isStrengthTitle(plannedTitle)
  const cardioPlan = isCardioTitle(plannedTitle)
  const hasStrength = completedStrengthWorkoutsForPlan(plannedTitle, strengthWorkouts).length > 0
  const hasCardio = cardioActivities.some(activity => isCardioSport(activity.sport_type))

  if (strengthPlan && !cardioPlan) return hasStrength
  if (cardioPlan && !strengthPlan) return hasCardio
  if (strengthPlan || cardioPlan) return hasStrength || hasCardio
  return false
}

export function completedWorkoutsMatchingPlan<T extends CompletedWorkout>(plannedTitle: string, workouts: T[]): T[] {
  if (!isStrengthTitle(plannedTitle)) return []
  return workouts.filter(workout => strengthSessionMatches(plannedTitle, workout.name ?? workout.title ?? ''))
}
