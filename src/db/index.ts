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
      db.workoutTemplates,
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
        db.workoutTemplates.clear(),
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
    workoutTemplates: await db.workoutTemplates.toArray(),
    appSettings: await db.appSettings.toArray(),
    exportedAt: new Date().toISOString(),
    version: 2,
  }

  return JSON.stringify(data, null, 2)
}

/**
 * Restore user data from a JSON backup produced by exportUserData. Replaces the
 * contents of each table present in the file (bulkPut = insert-or-overwrite by
 * id). Tables absent from the backup are left untouched. Throws on malformed
 * input so the caller can surface an error.
 */
export async function importUserData(json: string): Promise<void> {
  const data = JSON.parse(json) as Record<string, unknown[]>

  // Only known tables are restored; anything else in the file is ignored.
  const tableMap: Record<string, { bulkPut: (rows: unknown[]) => Promise<unknown>; clear: () => Promise<void> }> = {
    users: db.users as never,
    phases: db.phases as never,
    weeks: db.weeks as never,
    workouts: db.workouts as never,
    workoutBlocks: db.workoutBlocks as never,
    exerciseInstances: db.exerciseInstances as never,
    setInstances: db.setInstances as never,
    workoutReflections: db.workoutReflections as never,
    readinessScores: db.readinessScores as never,
    coachingInsights: db.coachingInsights as never,
    liftRecords: db.liftRecords as never,
    userAchievements: db.userAchievements as never,
    dailyCheckIns: db.dailyCheckIns as never,
    customExercises: db.customExercises as never,
    workoutTemplates: db.workoutTemplates as never,
    appSettings: db.appSettings as never,
  }

  for (const [name, table] of Object.entries(tableMap)) {
    const rows = data[name]
    if (!Array.isArray(rows)) continue
    await table.clear()
    if (rows.length > 0) await table.bulkPut(rows)
  }
}

// Re-export everything from schema
export * from './schema'
export { EXERCISE_LIBRARY } from './exercises'
