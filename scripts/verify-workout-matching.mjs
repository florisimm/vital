import assert from 'node:assert/strict'
import {
  completedWorkoutsForTodaySummary,
  completedWorkoutsMatchingPlan,
  hasCompletedPlannedWorkout,
  strengthSessionMatches,
} from '../lib/workout-matching.ts'

const pullB = [{ title: 'Pull B', start_time: '2026-06-28T08:00:00Z' }]
const pullDay = [{ title: 'Pull Day', start_time: '2026-06-28T08:00:00Z' }]

assert.equal(strengthSessionMatches('Pull Day', 'Pull B'), false)
assert.equal(strengthSessionMatches('Pull Day', 'Pull Day'), true)
assert.equal(strengthSessionMatches('Strength training', 'Pull B'), true)
assert.equal(strengthSessionMatches('Gym - Pull', 'Pull B'), true)

assert.equal(hasCompletedPlannedWorkout('Pull Day', pullB, []), false)
assert.equal(hasCompletedPlannedWorkout('Gym - Pull', pullB, []), true)
assert.equal(hasCompletedPlannedWorkout('Pull Day', pullDay, []), true)
assert.equal(hasCompletedPlannedWorkout('Strength training', pullB, []), true)

assert.deepEqual(
  completedWorkoutsMatchingPlan('Pull day recommended', [{ name: 'Pull B', sport: 'strength' }]),
  [],
)
assert.deepEqual(
  completedWorkoutsMatchingPlan('Pull day recommended', [{ name: 'Pull Day', sport: 'strength' }]),
  [{ name: 'Pull Day', sport: 'strength' }],
)

assert.deepEqual(
  completedWorkoutsForTodaySummary('Pull day recommended', [{ name: 'Pull B', sport: 'strength' }]),
  [{ name: 'Pull B', sport: 'strength' }],
)
