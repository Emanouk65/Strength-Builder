import { db } from './schema'
import { EXERCISE_LIBRARY } from './exercises'

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Initialize the database with seed data
 * Called once on first app load
 */
export async function initializeDatabase(): Promise<void> {
  // Check if exercises are already seeded
  const exerciseCount = await db.exercises.count()

  if (exerciseCount === 0) {
    console.log('Seeding exercise library...')
    await db.exercises.bulkAdd(EXERCISE_LIBRARY)
    console.log(`Seeded ${EXERCISE_LIBRARY.length} exercises`)
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
      db.quickLogEntries,
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
        db.quickLogEntries.clear(),
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
    quickLogEntries: await db.quickLogEntries.toArray(),
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
