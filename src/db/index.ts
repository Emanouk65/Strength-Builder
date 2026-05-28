import { db } from './schema'
import { EXERCISE_LIBRARY } from './exercises'

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Initialize the database with seed data
 * Called on every app load — bulkPut is idempotent (insert-or-update by id),
 * so new entries added to EXERCISE_LIBRARY in subsequent app versions land in
 * Dexie for returning users. Previously this only seeded when the table was
 * empty, which left returning users unable to look up newly added exercises
 * (the planner would silently drop their cards and the workout view would
 * fall back to the literal string "Exercise").
 */
export async function initializeDatabase(): Promise<void> {
  await db.exercises.bulkPut(EXERCISE_LIBRARY)

  // One-time cleanup: drop the legacy QuickLog localStorage session. Drafts now
  // live in Dexie via createDraftWorkout / getDraftWorkout.
  try {
    const flag = 'ql_session_cleared_v5'
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(flag)) {
      localStorage.removeItem('ql_session')
      localStorage.setItem(flag, '1')
    }
  } catch {
    // Storage unavailable (private mode / strict iframes) — fine to skip.
  }
}

/**
 * Clear all user data (for testing/reset)
 */
export async function clearUserData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.users,
      db.phases,
      db.weeks,
      db.workouts,
      db.workoutBlocks,
      db.exerciseInstances,
      db.setInstances,
      db.workoutReflections,
      db.readinessScores,
      db.coachingInsights,
      db.liftRecords,
      db.userAchievements,
      db.dailyCheckIns,
      db.customExercises,
    ],
    async () => {
      await Promise.all([
        db.users.clear(),
        db.phases.clear(),
        db.weeks.clear(),
        db.workouts.clear(),
        db.workoutBlocks.clear(),
        db.exerciseInstances.clear(),
        db.setInstances.clear(),
        db.workoutReflections.clear(),
        db.readinessScores.clear(),
        db.coachingInsights.clear(),
        db.liftRecords.clear(),
        db.userAchievements.clear(),
        db.dailyCheckIns.clear(),
        db.customExercises.clear(),
      ])
    }
  )
}

/**
 * Export all user data as JSON (for backup)
 */
export async function exportUserData(): Promise<string> {
  const data = {
    users: await db.users.toArray(),
    phases: await db.phases.toArray(),
    weeks: await db.weeks.toArray(),
    workouts: await db.workouts.toArray(),
    workoutBlocks: await db.workoutBlocks.toArray(),
    exerciseInstances: await db.exerciseInstances.toArray(),
    setInstances: await db.setInstances.toArray(),
    workoutReflections: await db.workoutReflections.toArray(),
    readinessScores: await db.readinessScores.toArray(),
    coachingInsights: await db.coachingInsights.toArray(),
    liftRecords: await db.liftRecords.toArray(),
    userAchievements: await db.userAchievements.toArray(),
    dailyCheckIns: await db.dailyCheckIns.toArray(),
    customExercises: await db.customExercises.toArray(),
    exportedAt: new Date().toISOString(),
    version: 1,
  }

  return JSON.stringify(data, null, 2)
}

// Re-export everything from schema
export * from './schema'
export { EXERCISE_LIBRARY } from './exercises'
