import Dexie, { type EntityTable } from 'dexie'
import type {
  User,
  Phase,
  Week,
  Workout,
  WorkoutBlock,
  ExerciseInstance,
  SetInstance,
  WorkoutReflection,
  Exercise,
  ReadinessScore,
  CoachingInsight,
  LiftRecord,
  UserAchievement,
  AchievementId,
  DailyCheckIn,
  AppSettings,
  StoredAppSettings,
  WorkoutTemplate,
  TemplateExercise,
} from '@/lib/types'
import { getLocalDateString, calculateE1RM, getExerciseInputKind, generateWarmupSets } from '@/lib/utils'
import { computeReadinessScore, recommendedSetWeight, type ReadinessResult } from '@/lib/readiness'
import { EXERCISE_LIBRARY } from './exercises'

// In-memory lookup for the seed library — used as a fallback when the Dexie
// `exercises` table is missing a row (stale data from before a seed upgrade,
// or a race between adding an exercise and the live query observing it).
const LIBRARY_BY_ID: Map<string, Exercise> = new Map(EXERCISE_LIBRARY.map(e => [e.id, e]))

/**
 * Look up an exercise definition for a given id, preferring custom exercises
 * → seeded library → in-memory library. Returns undefined if truly unknown.
 */
export async function resolveExercise(exerciseId: string): Promise<Exercise | undefined> {
  const lib = await db.exercises.get(exerciseId)
  if (lib) return lib
  const custom = await db.customExercises.get(exerciseId)
  if (custom) return custom
  return LIBRARY_BY_ID.get(exerciseId)
}

/**
 * Batch resolver: returns a Map of id → Exercise. Reads both Dexie tables
 * once, then fills any gaps from the in-memory library so the planner /
 * execution views never end up with an undefined exercise.
 */
export async function resolveExercises(exerciseIds: string[]): Promise<Map<string, Exercise>> {
  const out = new Map<string, Exercise>()
  if (exerciseIds.length === 0) return out
  const [lib, custom] = await Promise.all([
    db.exercises.where('id').anyOf(exerciseIds).toArray(),
    db.customExercises.where('id').anyOf(exerciseIds).toArray(),
  ])
  for (const e of lib) out.set(e.id, e)
  for (const e of custom) out.set(e.id, e)
  for (const id of exerciseIds) {
    if (!out.has(id)) {
      const fallback = LIBRARY_BY_ID.get(id)
      if (fallback) out.set(id, fallback)
    }
  }
  return out
}

// ============================================================================
// Database Schema Definition
// ============================================================================

export class ForgeDB extends Dexie {
  // Tables
  users!: EntityTable<User, 'id'>
  phases!: EntityTable<Phase, 'id'>
  weeks!: EntityTable<Week, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  workoutBlocks!: EntityTable<WorkoutBlock, 'id'>
  exerciseInstances!: EntityTable<ExerciseInstance, 'id'>
  setInstances!: EntityTable<SetInstance, 'id'>
  workoutReflections!: EntityTable<WorkoutReflection, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  readinessScores!: EntityTable<ReadinessScore, 'id'>
  coachingInsights!: EntityTable<CoachingInsight, 'id'>
  liftRecords!: EntityTable<LiftRecord, 'id'>
  userAchievements!: EntityTable<UserAchievement, 'id'>
  dailyCheckIns!: EntityTable<DailyCheckIn, 'id'>
  customExercises!: EntityTable<Exercise, 'id'>
  appSettings!: EntityTable<StoredAppSettings, 'id'>
  workoutTemplates!: EntityTable<WorkoutTemplate, 'id'>

  constructor() {
    super('ForgeDB')

    this.version(3).stores({
      users: 'id, createdAt',
      phases: 'id, userId, status, startDate, endDate, type',
      weeks: 'id, phaseId, weekNumber, startDate, status',
      workouts: 'id, userId, weekId, workoutType, scheduledDate, status, dayOfWeek, completedAt',
      workoutBlocks: 'id, workoutId, type, order',
      exerciseInstances: 'id, blockId, exerciseId, order',
      setInstances: 'id, exerciseInstanceId, setNumber, completed',
      workoutReflections: 'id, workoutId, completedAt',
      exercises: 'id, name, category, movementPattern, *primaryMuscles, *equipment, cardioType',
      readinessScores: 'id, userId, date',
      coachingInsights: 'id, userId, weekId, workoutId, createdAt, type, dismissed',
      liftRecords: 'id, userId, exerciseId, date, isPersonalRecord',
      userAchievements: 'id, userId, achievementId, unlockedAt, seen',
      quickLogEntries: 'id, workoutId, exerciseId, order',
      dailyCheckIns: 'id, userId, date, completedAt, workoutId',
    })

    this.version(4).stores({
      users: 'id, createdAt',
      phases: 'id, userId, status, startDate, endDate, type',
      weeks: 'id, phaseId, weekNumber, startDate, status',
      workouts: 'id, userId, weekId, workoutType, scheduledDate, status, dayOfWeek, completedAt',
      workoutBlocks: 'id, workoutId, type, order',
      exerciseInstances: 'id, blockId, exerciseId, order',
      setInstances: 'id, exerciseInstanceId, setNumber, completed',
      workoutReflections: 'id, workoutId, completedAt',
      exercises: 'id, name, category, movementPattern, *primaryMuscles, *equipment, cardioType',
      readinessScores: 'id, userId, date',
      coachingInsights: 'id, userId, weekId, workoutId, createdAt, type, dismissed',
      liftRecords: 'id, userId, exerciseId, date, isPersonalRecord',
      userAchievements: 'id, userId, achievementId, unlockedAt, seen',
      quickLogEntries: 'id, workoutId, exerciseId, order',
      dailyCheckIns: 'id, userId, date, completedAt, workoutId',
      customExercises: 'id, name, category, movementPattern, *primaryMuscles',
    })

    // v5 — unifies ad-hoc QuickLogEntries into the WorkoutBlock/ExerciseInstance/SetInstance schema.
    // Adds 'draft' to workout.status (no index change needed — status is already indexed).
    // Adds workout.lastEditedAt for draft autosave tracking.
    // The quickLogEntries table is still defined here so the .upgrade() callback
    // below can read it for the v4 → v5 migration.
    this.version(5).stores({
      users: 'id, createdAt',
      phases: 'id, userId, status, startDate, endDate, type',
      weeks: 'id, phaseId, weekNumber, startDate, status',
      workouts: 'id, userId, weekId, workoutType, scheduledDate, status, dayOfWeek, completedAt, lastEditedAt',
      workoutBlocks: 'id, workoutId, type, order',
      exerciseInstances: 'id, blockId, exerciseId, order',
      setInstances: 'id, exerciseInstanceId, setNumber, completed',
      workoutReflections: 'id, workoutId, completedAt',
      exercises: 'id, name, category, movementPattern, *primaryMuscles, *equipment, cardioType',
      readinessScores: 'id, userId, date',
      coachingInsights: 'id, userId, weekId, workoutId, createdAt, type, dismissed',
      liftRecords: 'id, userId, exerciseId, date, isPersonalRecord',
      userAchievements: 'id, userId, achievementId, unlockedAt, seen',
      quickLogEntries: 'id, workoutId, exerciseId, order',
      dailyCheckIns: 'id, userId, date, completedAt, workoutId',
      customExercises: 'id, name, category, movementPattern, *primaryMuscles',
    }).upgrade(async tx => {
      // Backfill lastEditedAt for existing workouts.
      await tx.table('workouts').toCollection().modify((w: { lastEditedAt?: Date | null; completedAt?: Date | null; scheduledDate?: Date }) => {
        w.lastEditedAt = w.completedAt ?? w.scheduledDate ?? null
      })

      // Migrate every QuickLogEntry into one synthetic WorkoutBlock + ExerciseInstance + SetInstance rows.
      // This unifies the data model so the rest of the app only sees one shape.
      const qles = await tx.table('quickLogEntries').toArray()
      if (qles.length === 0) return

      const byWorkout = new Map<string, typeof qles>()
      for (const q of qles) {
        const list = byWorkout.get(q.workoutId) ?? []
        list.push(q)
        byWorkout.set(q.workoutId, list)
      }

      for (const [workoutId, entries] of byWorkout) {
        // Skip if this workout already has blocks (avoid double migration).
        const existingBlocks = await tx.table('workoutBlocks')
          .where('workoutId').equals(workoutId).count()
        if (existingBlocks > 0) continue

        const blockId = crypto.randomUUID()
        await tx.table('workoutBlocks').add({
          id: blockId,
          workoutId,
          type: 'primary',
          order: 0,
          timeTarget: 0,
          intent: 'Migrated from quick log',
          completed: true,
        })

        entries.sort((a, b) => a.order - b.order)
        for (const e of entries) {
          const instId = crypto.randomUUID()
          await tx.table('exerciseInstances').add({
            id: instId,
            blockId,
            exerciseId: e.exerciseId,
            order: e.order,
            notes: e.notes ?? '',
            substituteFor: null,
            substitutionReason: null,
            supersetGroupId: null,
          })

          if (e.sets && e.sets.length > 0) {
            await tx.table('setInstances').bulkAdd(e.sets.map((s: {
              setNumber: number; weight: number | null; reps: number | null;
              duration: number | null; rpe: number | null; completed: boolean
            }) => ({
              id: crypto.randomUUID(),
              exerciseInstanceId: instId,
              setNumber: s.setNumber,
              setType: 'working',
              targetReps: null,
              targetWeight: null,
              targetRPE: null,
              targetDuration: null,
              actualReps: s.reps,
              actualWeight: s.weight,
              actualRPE: s.rpe,
              actualDuration: s.duration,
              completed: s.completed,
              skipped: false,
              painSignal: null,
            })))
          }
        }
      }
    })

    // v6 — drops the deprecated quickLogEntries table. All data was already
    // migrated to the unified WorkoutBlock/ExerciseInstance/SetInstance schema
    // in v5, so this is a pure cleanup step.
    this.version(6).stores({
      quickLogEntries: null,
    })

    // v7 — adds supersetGroupId index on exerciseInstances and backfills nulls
    // onto existing rows. Exercises sharing the same supersetGroupId form a
    // group (up to 5 members) that's visually stacked in the planner and
    // alternates set-by-set during execution.
    this.version(7).stores({
      exerciseInstances: 'id, blockId, exerciseId, order, supersetGroupId',
    }).upgrade(async tx => {
      await tx.table('exerciseInstances').toCollection().modify((inst: { supersetGroupId?: string | null }) => {
        if (inst.supersetGroupId === undefined) inst.supersetGroupId = null
      })
    })

    // v8 — adds app settings (haptics/sound/rest timer) and reusable workout
    // templates. Both are new tables; no data migration required.
    this.version(8).stores({
      appSettings: 'id',
      workoutTemplates: 'id, name, createdAt',
    })
  }
}

// Singleton database instance
export const db = new ForgeDB()

// ============================================================================
// Database Helper Functions
// ============================================================================

/**
 * Get the current user (or null if not onboarded)
 */
export async function getCurrentUser(): Promise<User | undefined> {
  return db.users.toCollection().first()
}

// ----------------------------------------------------------------------------
// App Settings (singleton row)
// ----------------------------------------------------------------------------

const APP_SETTINGS_ID = 'app'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'dark',
  hapticFeedback: true,
  restTimerSound: true,
  restTimerEnabled: true,
  defaultRestTime: 90,
  showRPEGuide: true,
}

/** Read app settings, falling back to defaults for any missing fields. */
export async function getAppSettings(): Promise<AppSettings> {
  const stored = await db.appSettings.get(APP_SETTINGS_ID)
  return { ...DEFAULT_APP_SETTINGS, ...(stored ?? {}) }
}

/** Patch app settings (creating the row if it doesn't exist yet). */
export async function updateAppSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({ ...current, ...patch, id: APP_SETTINGS_ID })
}

/**
 * Get the active phase for a user
 */
export async function getActivePhase(userId: string): Promise<Phase | undefined> {
  return db.phases
    .where({ userId, status: 'active' })
    .first()
}

/**
 * Get today's workout
 */
export async function getTodaysWorkout(userId: string): Promise<Workout | undefined> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const activePhase = await getActivePhase(userId)
  if (!activePhase) return undefined

  const weeks = await db.weeks
    .where('phaseId')
    .equals(activePhase.id)
    .toArray()

  const weekIds = weeks.map(w => w.id)

  return db.workouts
    .where('weekId')
    .anyOf(weekIds)
    .filter(w => {
      const scheduled = new Date(w.scheduledDate)
      return scheduled >= today && scheduled < tomorrow
    })
    .first()
}

/**
 * Get all blocks for a workout with exercises and sets
 */
export async function getWorkoutWithDetails(workoutId: string) {
  const workout = await db.workouts.get(workoutId)
  if (!workout) return null

  const blocks = await db.workoutBlocks
    .where('workoutId')
    .equals(workoutId)
    .sortBy('order')

  // Batch fetch all instances for all blocks at once
  const blockIds = blocks.map(b => b.id)
  const allInstances = await db.exerciseInstances
    .where('blockId')
    .anyOf(blockIds)
    .toArray()

  // Batch fetch all exercises needed — merge library + custom so user-defined
  // exercises render with their proper name/muscles in the execution view.
  // resolveExercises falls back to the in-memory EXERCISE_LIBRARY for any id
  // missing from Dexie (e.g. a returning user who added an exercise from a
  // version that wasn't yet seeded). Without this fallback, the execution
  // view would render the name as the placeholder string "Exercise".
  const exerciseIds = [...new Set(allInstances.map(i => i.exerciseId))]
  const exerciseMap = await resolveExercises(exerciseIds)

  // Batch fetch all sets for all instances
  const instanceIds = allInstances.map(i => i.id)
  const allSets = await db.setInstances
    .where('exerciseInstanceId')
    .anyOf(instanceIds)
    .toArray()

  // Group sets by instance
  const setsByInstance = new Map<string, typeof allSets>()
  for (const set of allSets) {
    const list = setsByInstance.get(set.exerciseInstanceId) || []
    list.push(set)
    setsByInstance.set(set.exerciseInstanceId, list)
  }

  // Assemble the result
  const blocksWithExercises = blocks.map(block => {
    const instances = allInstances
      .filter(i => i.blockId === block.id)
      .sort((a, b) => a.order - b.order)

    const instancesWithSets = instances.map(instance => ({
      ...instance,
      exercise: exerciseMap.get(instance.exerciseId),
      sets: (setsByInstance.get(instance.id) || []).sort((a, b) => a.setNumber - b.setNumber),
    }))

    return {
      ...block,
      exercises: instancesWithSets,
    }
  })

  const reflection = await db.workoutReflections
    .where('workoutId')
    .equals(workoutId)
    .first()

  return {
    ...workout,
    blocks: blocksWithExercises,
    reflection,
  }
}

/**
 * Calculate weekly volume (total working sets completed)
 */
export async function calculateWeeklyVolume(weekId: string): Promise<number> {
  const workouts = await db.workouts
    .where('weekId')
    .equals(weekId)
    .toArray()

  let totalSets = 0

  for (const workout of workouts) {
    const blocks = await db.workoutBlocks
      .where('workoutId')
      .equals(workout.id)
      .toArray()

    for (const block of blocks) {
      const instances = await db.exerciseInstances
        .where('blockId')
        .equals(block.id)
        .toArray()

      for (const instance of instances) {
        const sets = await db.setInstances
          .where('exerciseInstanceId')
          .equals(instance.id)
          .filter(s => s.completed && s.setType === 'working')
          .count()

        totalSets += sets
      }
    }
  }

  return totalSets
}

/**
 * Get recent reflections for trend analysis
 */
export async function getRecentReflections(
  userId: string,
  limit: number = 7
): Promise<WorkoutReflection[]> {
  const activePhase = await getActivePhase(userId)
  if (!activePhase) return []

  const weeks = await db.weeks
    .where('phaseId')
    .equals(activePhase.id)
    .toArray()

  const weekIds = weeks.map(w => w.id)

  const workouts = await db.workouts
    .where('weekId')
    .anyOf(weekIds)
    .filter(w => w.status === 'completed')
    .toArray()

  const workoutIds = workouts.map(w => w.id)

  return db.workoutReflections
    .where('workoutId')
    .anyOf(workoutIds)
    .reverse()
    .limit(limit)
    .toArray()
}

/**
 * Get exercise by ID
 */
export async function getExercise(exerciseId: string): Promise<Exercise | undefined> {
  return db.exercises.get(exerciseId)
}

/**
 * Get substitutes for an exercise considering injury profile
 */
export async function getExerciseSubstitutes(
  exerciseId: string,
  injuryLocations: string[]
): Promise<Exercise[]> {
  const exercise = await db.exercises.get(exerciseId)
  if (!exercise) return []

  const substitutes = await db.exercises
    .where('id')
    .anyOf(exercise.substitutes)
    .toArray()

  // Filter out exercises that aggravate current injuries
  return substitutes.filter(sub =>
    !sub.injuryContraindications.some(contra =>
      injuryLocations.includes(contra)
    )
  )
}

/**
 * Get the current PR record for an exercise.
 *
 * IMPORTANT: `isPersonalRecord` is filtered in JS, NOT via `.where()`. IndexedDB
 * cannot use boolean values as index keys, so `.where({ isPersonalRecord: true })`
 * throws an invalid-key error at runtime. That bug previously made saving and
 * reading PRs fail entirely (the throw aborted the insert in addManualLiftRecord
 * and rejected getAllPRs). Query only string-indexed fields, then filter here.
 */
async function getCurrentPR(userId: string, exerciseId: string): Promise<LiftRecord | undefined> {
  const records = await db.liftRecords.where({ userId, exerciseId }).toArray()
  return records.find(r => r.isPersonalRecord)
}

/**
 * Record a personal record
 */
export async function checkAndRecordPR(
  userId: string,
  exerciseId: string,
  weight: number,
  reps: number,
  rpe: number | null
): Promise<boolean> {
  const estimated1RM = calculateE1RM(weight, reps)

  const existingPR = await getCurrentPR(userId, exerciseId)

  const isPR = !existingPR || estimated1RM > existingPR.estimated1RM

  await db.liftRecords.add({
    id: crypto.randomUUID(),
    userId,
    exerciseId,
    date: new Date(),
    weight,
    reps,
    rpe,
    estimated1RM,
    isPersonalRecord: isPR,
  })

  // Update previous PR if this is the new one
  if (isPR && existingPR) {
    await db.liftRecords.update(existingPR.id, { isPersonalRecord: false })
  }

  return isPR
}

// ============================================================================
// Streak & Achievement Functions
// ============================================================================

/**
 * Update user streak after completing a workout
 * Returns any newly unlocked achievements
 */
export async function updateStreakOnWorkoutComplete(
  userId: string
): Promise<AchievementId[]> {
  const user = await db.users.get(userId)
  if (!user) return []

  const today = getLocalDateString()
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = getLocalDateString(yesterdayDate)

  let newStreak = user.currentStreak
  let isComeback = false

  // Check if this extends the streak or starts a new one
  if (user.lastWorkoutDate === yesterday) {
    // Consecutive day - extend streak
    newStreak = user.currentStreak + 1
  } else if (user.lastWorkoutDate === today) {
    // Already worked out today - no change
    return []
  } else {
    // Check for comeback (7+ days off)
    if (user.lastWorkoutDate) {
      const lastDate = new Date(user.lastWorkoutDate)
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000)
      isComeback = daysSince >= 7
    }
    // Gap in streak - start fresh
    newStreak = 1
  }

  const newLongest = Math.max(user.longestStreak, newStreak)
  const newTotal = user.totalWorkoutsCompleted + 1

  // Update user
  await db.users.update(userId, {
    currentStreak: newStreak,
    longestStreak: newLongest,
    lastWorkoutDate: today,
    totalWorkoutsCompleted: newTotal,
  })

  // Check for new achievements
  const unlockedAchievements: AchievementId[] = []

  // Workout milestones
  const workoutMilestones: [number, AchievementId][] = [
    [1, 'first_workout'],
    [5, 'workout_5'],
    [10, 'workout_10'],
    [25, 'workout_25'],
    [50, 'workout_50'],
    [100, 'workout_100'],
  ]

  for (const [threshold, achievementId] of workoutMilestones) {
    if (newTotal === threshold) {
      const unlocked = await unlockAchievement(userId, achievementId)
      if (unlocked) unlockedAchievements.push(achievementId)
    }
  }

  // Streak milestones
  const streakMilestones: [number, AchievementId][] = [
    [3, 'streak_3'],
    [7, 'streak_7'],
    [14, 'streak_14'],
    [30, 'streak_30'],
    [60, 'streak_60'],
    [100, 'streak_100'],
  ]

  for (const [threshold, achievementId] of streakMilestones) {
    if (newStreak === threshold) {
      const unlocked = await unlockAchievement(userId, achievementId)
      if (unlocked) unlockedAchievements.push(achievementId)
    }
  }

  // Comeback achievement
  if (isComeback) {
    const unlocked = await unlockAchievement(userId, 'comeback')
    if (unlocked) unlockedAchievements.push('comeback')
  }

  return unlockedAchievements
}

/**
 * Check for time-based achievements (early bird, night owl)
 */
export async function checkTimeBasedAchievements(
  userId: string
): Promise<AchievementId[]> {
  const hour = new Date().getHours()
  const unlockedAchievements: AchievementId[] = []

  if (hour < 7) {
    const unlocked = await unlockAchievement(userId, 'early_bird')
    if (unlocked) unlockedAchievements.push('early_bird')
  }

  if (hour >= 21) {
    const unlocked = await unlockAchievement(userId, 'night_owl')
    if (unlocked) unlockedAchievements.push('night_owl')
  }

  return unlockedAchievements
}

/**
 * Check for iron will achievement (workout with low energy)
 */
export async function checkIronWillAchievement(
  userId: string,
  energyRating: number
): Promise<boolean> {
  if (energyRating < 5) {
    return await unlockAchievement(userId, 'iron_will')
  }
  return false
}

/**
 * Check PR milestones
 */
export async function checkPRAchievements(
  userId: string
): Promise<AchievementId[]> {
  const records = await db.liftRecords.where('userId').equals(userId).toArray()
  const prCount = records.filter(r => r.isPersonalRecord).length

  const unlockedAchievements: AchievementId[] = []

  const prMilestones: [number, AchievementId][] = [
    [1, 'first_pr'],
    [5, 'pr_5'],
    [10, 'pr_10'],
    [25, 'pr_25'],
  ]

  for (const [threshold, achievementId] of prMilestones) {
    if (prCount === threshold) {
      const unlocked = await unlockAchievement(userId, achievementId)
      if (unlocked) unlockedAchievements.push(achievementId)
    }
  }

  return unlockedAchievements
}

/**
 * Unlock an achievement for a user
 * Returns true if newly unlocked, false if already had it
 */
export async function unlockAchievement(
  userId: string,
  achievementId: AchievementId
): Promise<boolean> {
  // Check if already unlocked
  const existing = await db.userAchievements
    .where({ userId: userId, achievementId })
    .first()

  if (existing) return false

  // Unlock it
  await db.userAchievements.add({
    id: crypto.randomUUID(),
    userId: userId,
    achievementId,
    unlockedAt: new Date(),
    seen: false,
  })

  return true
}

/**
 * Get all unlocked achievements for a user
 */
export async function getUserAchievements(
  userId: string
): Promise<UserAchievement[]> {
  return db.userAchievements
    .where('userId')
    .equals(userId)
    .toArray()
}

/**
 * Get unseen achievements (for notifications)
 */
export async function getUnseenAchievements(
  userId: string
): Promise<UserAchievement[]> {
  // `seen` is filtered in JS — IndexedDB can't use booleans as index keys, so
  // `.where({ seen: false })` throws an invalid-key error (see getCurrentPR).
  const achievements = await db.userAchievements.where('userId').equals(userId).toArray()
  return achievements.filter(a => !a.seen)
}

/**
 * Mark achievements as seen
 */
export async function markAchievementsSeen(
  achievementIds: string[]
): Promise<void> {
  await db.userAchievements
    .where('id')
    .anyOf(achievementIds)
    .modify({ seen: true })
}

// ============================================================================
// Daily Check-In Functions
// ============================================================================

/**
 * Get today's check-in for a user
 */
export async function getTodaysCheckIn(
  userId: string
): Promise<DailyCheckIn | undefined> {
  const today = getLocalDateString()
  return db.dailyCheckIns
    .where({ userId, date: today })
    .first()
}

/**
 * Get recent check-ins for a user
 */
export async function getRecentCheckIns(
  userId: string,
  days: number = 7
): Promise<DailyCheckIn[]> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = getLocalDateString(startDate)

  return db.dailyCheckIns
    .where('userId')
    .equals(userId)
    .filter(c => c.date >= startDateStr)
    .reverse()
    .toArray()
}

/**
 * Save a daily check-in
 */
export async function saveDailyCheckIn(
  checkIn: DailyCheckIn
): Promise<void> {
  // Check if there's already a check-in for this date
  const existing = await db.dailyCheckIns
    .where({ userId: checkIn.userId, date: checkIn.date })
    .first()

  if (existing) {
    // Update existing check-in
    await db.dailyCheckIns.update(existing.id, checkIn)
  } else {
    // Add new check-in
    await db.dailyCheckIns.add(checkIn)
  }
}

/**
 * Get check-in streak (consecutive days with check-ins)
 */
export async function getCheckInStreak(userId: string): Promise<number> {
  const checkIns = await db.dailyCheckIns
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('date')

  if (checkIns.length === 0) return 0

  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < checkIns.length; i++) {
    const checkInDate = new Date(checkIns[i].date)
    const expectedDate = new Date(today)
    expectedDate.setDate(today.getDate() - i)

    if (checkInDate.toDateString() === expectedDate.toDateString()) {
      streak++
    } else {
      break
    }
  }

  return streak
}

// ============================================================================
// Dynamic Program Scheduling Functions
// ============================================================================

/**
 * Get the next available (uncompleted) workout in the active phase
 * Returns the earliest uncompleted workout regardless of scheduled date
 */
export async function getNextAvailableWorkout(userId: string): Promise<Workout | undefined> {
  const activePhase = await getActivePhase(userId)
  if (!activePhase) return undefined

  const weeks = await db.weeks
    .where('phaseId')
    .equals(activePhase.id)
    .sortBy('weekNumber')

  if (weeks.length === 0) return undefined

  const weekIds = weeks.map(w => w.id)

  // Get all uncompleted workouts in the phase, sorted by scheduled date
  const uncompletedWorkouts = await db.workouts
    .where('weekId')
    .anyOf(weekIds)
    .filter(w => w.status === 'planned' || w.status === 'in_progress')
    .sortBy('scheduledDate')

  return uncompletedWorkouts[0]
}

/**
 * Get all missed workouts (past scheduled date, still uncompleted)
 */
export async function getMissedWorkouts(userId: string): Promise<Workout[]> {
  const activePhase = await getActivePhase(userId)
  if (!activePhase) return []

  const weeks = await db.weeks
    .where('phaseId')
    .equals(activePhase.id)
    .toArray()

  if (weeks.length === 0) return []

  const weekIds = weeks.map(w => w.id)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get workouts that are scheduled before today and still planned
  const missedWorkouts = await db.workouts
    .where('weekId')
    .anyOf(weekIds)
    .filter(w => {
      const scheduledDate = new Date(w.scheduledDate)
      scheduledDate.setHours(0, 0, 0, 0)
      return scheduledDate < today && w.status === 'planned'
    })
    .sortBy('scheduledDate')

  return missedWorkouts
}

/**
 * Skip a workout with optional reason
 */
export async function skipWorkout(workoutId: string, reason?: string): Promise<void> {
  await db.workouts.update(workoutId, {
    status: 'skipped',
    skipReason: reason || 'Skipped by user',
  })
}

/**
 * Get last workout data for an exercise (for weight suggestions)
 * Returns the heaviest completed set from the most recent workout containing this exercise.
 * Looks at both quick log entries and programmed set instances.
 */
export async function getLastWorkoutForExercise(
  userId: string,
  exerciseId: string
): Promise<{ weight: number; reps: number; rpe: number | null } | null> {
  // Get completed workouts sorted by completedAt descending (most recent first)
  const recentWorkouts = await db.workouts
    .where('userId')
    .equals(userId)
    .filter(w => w.status === 'completed' && w.completedAt != null)
    .toArray()

  // Sort in JS since Dexie can't sort by a filtered field reliably
  recentWorkouts.sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0
    return bTime - aTime
  })

  for (const workout of recentWorkouts.slice(0, 30)) {
    const blocks = await db.workoutBlocks
      .where('workoutId')
      .equals(workout.id)
      .toArray()

    if (blocks.length === 0) continue

    const blockIds = blocks.map(b => b.id)
    const instances = await db.exerciseInstances
      .where('blockId')
      .anyOf(blockIds)
      .filter(i => i.exerciseId === exerciseId)
      .toArray()

    if (instances.length === 0) continue

    const instanceIds = instances.map(i => i.id)
    const completedSets = await db.setInstances
      .where('exerciseInstanceId')
      .anyOf(instanceIds)
      .filter(s => s.completed && s.actualWeight != null && s.actualReps != null)
      .toArray()

    if (completedSets.length > 0) {
      // Return the heaviest set
      const best = completedSets.reduce((max, s) => (s.actualWeight! > max.actualWeight! ? s : max))
      return {
        weight: best.actualWeight!,
        reps: best.actualReps!,
        rpe: best.actualRPE,
      }
    }
  }

  return null
}

export interface ExerciseHistorySession {
  workoutId: string
  date: Date
  sets: {
    weight: number | null
    reps: number | null
    rpe: number | null
    duration: number | null
    distance: number | null
  }[]
}

/**
 * Get recent logged sessions for an exercise (most recent first) — powers the
 * per-exercise history sheet. Each session lists its completed sets.
 */
export async function getExerciseHistory(
  userId: string,
  exerciseId: string,
  limit = 8
): Promise<ExerciseHistorySession[]> {
  const workouts = await db.workouts
    .where('userId')
    .equals(userId)
    .filter(w => w.status === 'completed' && w.completedAt != null)
    .toArray()

  workouts.sort((a, b) => {
    const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
    const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
    return bt - at
  })

  const sessions: ExerciseHistorySession[] = []
  for (const workout of workouts) {
    if (sessions.length >= limit) break

    const blocks = await db.workoutBlocks.where('workoutId').equals(workout.id).toArray()
    if (blocks.length === 0) continue
    const blockIds = blocks.map(b => b.id)

    const instances = await db.exerciseInstances
      .where('blockId').anyOf(blockIds)
      .filter(i => i.exerciseId === exerciseId)
      .toArray()
    if (instances.length === 0) continue

    const instanceIds = instances.map(i => i.id)
    const setRows = await db.setInstances
      .where('exerciseInstanceId').anyOf(instanceIds)
      .filter(s => s.completed && s.setType !== 'warmup')
      .toArray()
    if (setRows.length === 0) continue

    setRows.sort((a, b) => a.setNumber - b.setNumber)
    sessions.push({
      workoutId: workout.id,
      date: workout.completedAt as Date,
      sets: setRows.map(s => ({
        weight: s.actualWeight ?? s.targetWeight,
        reps: s.actualReps ?? s.targetReps,
        rpe: s.actualRPE ?? s.targetRPE,
        duration: s.actualDuration ?? s.targetDuration,
        distance: s.actualDistance ?? s.targetDistance ?? null,
      })),
    })
  }

  return sessions
}

/**
 * Get best lift record for an exercise (for weight suggestions)
 */
export async function getBestLift(userId: string, exerciseId: string): Promise<LiftRecord | undefined> {
  return getCurrentPR(userId, exerciseId)
}

/**
 * Add or update a manual lift record
 */
export async function addManualLiftRecord(
  userId: string,
  exerciseId: string,
  weight: number,
  reps: number
): Promise<boolean> {
  const estimated1RM = calculateE1RM(weight, reps)

  // Check if this beats the existing PR
  const existingPR = await getCurrentPR(userId, exerciseId)

  const isPR = !existingPR || estimated1RM > existingPR.estimated1RM

  // Add the new record
  await db.liftRecords.add({
    id: crypto.randomUUID(),
    userId,
    exerciseId,
    date: new Date(),
    weight,
    reps,
    rpe: null,
    estimated1RM,
    isPersonalRecord: isPR,
    isManualEntry: true,
  })

  // Update previous PR if this is the new one
  if (isPR && existingPR) {
    await db.liftRecords.update(existingPR.id, { isPersonalRecord: false })
  }

  return isPR
}

/**
 * Get all PRs for a user (one per exercise)
 */
export async function getAllPRs(userId: string): Promise<LiftRecord[]> {
  const records = await db.liftRecords.where('userId').equals(userId).toArray()
  return records.filter(r => r.isPersonalRecord)
}

// ============================================================================
// Custom Exercise Functions
// ============================================================================

/**
 * Add a custom exercise
 */
export async function addCustomExercise(exercise: Exercise): Promise<void> {
  await db.customExercises.add({ ...exercise, isCustom: true })
}

/**
 * Get all custom exercises
 */
export async function getCustomExercises(): Promise<Exercise[]> {
  return db.customExercises.toArray()
}

/**
 * Delete a custom exercise
 */
export async function deleteCustomExercise(exerciseId: string): Promise<void> {
  await db.customExercises.delete(exerciseId)
}

// ============================================================================
// Draft & Planning Functions (v5)
// ============================================================================

/**
 * Get the current in-progress draft workout for a user.
 * One draft per user — `createDraftWorkout` checks this first.
 */
export async function getDraftWorkout(userId: string): Promise<Workout | undefined> {
  return db.workouts
    .where({ userId, status: 'draft' })
    .first()
}

/**
 * Create a draft workout for the user (or return the existing one).
 * A draft starts with one empty 'primary' block ready for exercises.
 * The check-then-insert runs inside a single transaction so two concurrent
 * callers can't both create a new draft.
 */
export async function createDraftWorkout(userId: string): Promise<Workout> {
  return db.transaction('rw', [db.workouts, db.workoutBlocks], async () => {
    const existing = await db.workouts
      .where({ userId, status: 'draft' })
      .first()
    if (existing) return existing

    const now = new Date()
    const workout: Workout = {
      id: crypto.randomUUID(),
      userId,
      weekId: null,
      workoutType: 'quick_log',
      dayOfWeek: now.getDay(),
      scheduledDate: now,
      completedAt: null,
      status: 'draft',
      lastEditedAt: now,
      name: '',
      totalDuration: 0,
      coachingNotes: [],
      skipReason: null,
    }

    await db.workouts.add(workout)
    await db.workoutBlocks.add({
      id: crypto.randomUUID(),
      workoutId: workout.id,
      type: 'primary',
      order: 0,
      timeTarget: 0,
      intent: '',
      completed: false,
    })

    return workout
  })
}

/**
 * Add an exercise to a draft workout — creates an ExerciseInstance in the
 * given block (or the first block if not specified) plus N SetInstances.
 *
 * Cardio exercises (category 'cardio' or cardio_steady / cardio_intervals
 * movement patterns) default to a single "set" representing one continuous
 * session, since "3 sets of a treadmill run" is not what users expect.
 */
export async function addExerciseToDraft(
  workoutId: string,
  exerciseId: string,
  options: {
    sets?: number
    targetReps?: number | null
    targetWeight?: number | null
    targetDuration?: number | null
    targetDistance?: number | null
    blockId?: string
  } = {}
): Promise<string> {
  // Pick a sensible default set count: 1 for cardio sessions, 3 for strength.
  // Cardio is detected from any of: explicit cardio category, cardio movement
  // patterns, or cardio-machine equipment (covers treadmill, bike, rower, etc.
  // which are tagged 'conditioning' in the library).
  const exercise = await resolveExercise(exerciseId)
  const isCardio =
    exercise?.category === 'cardio' ||
    exercise?.movementPattern === 'cardio_steady' ||
    exercise?.movementPattern === 'cardio_intervals' ||
    (Array.isArray(exercise?.equipment) && exercise.equipment.includes('cardio_machine'))

  const sets = options.sets ?? (isCardio ? 1 : 3)
  const targetReps = options.targetReps ?? null
  const targetWeight = options.targetWeight ?? null
  const targetDuration = options.targetDuration ?? null
  const targetDistance = options.targetDistance ?? null

  let blockId = options.blockId
  if (!blockId) {
    const firstBlock = await db.workoutBlocks
      .where('workoutId').equals(workoutId)
      .sortBy('order')
      .then(blocks => blocks[0])
    if (!firstBlock) {
      throw new Error(`Workout ${workoutId} has no blocks`)
    }
    blockId = firstBlock.id
  }

  // Determine the next order index in the block.
  const existingInstances = await db.exerciseInstances
    .where('blockId').equals(blockId)
    .toArray()
  const nextOrder = existingInstances.length

  const instId = crypto.randomUUID()
  await db.transaction('rw', [db.exerciseInstances, db.setInstances, db.workouts], async () => {
    await db.exerciseInstances.add({
      id: instId,
      blockId: blockId!,
      exerciseId,
      order: nextOrder,
      notes: '',
      substituteFor: null,
      substitutionReason: null,
      supersetGroupId: null,
    })

    const setRows = Array.from({ length: sets }, (_, i) => ({
      id: crypto.randomUUID(),
      exerciseInstanceId: instId,
      setNumber: i + 1,
      setType: 'working' as const,
      targetReps,
      targetWeight,
      targetRPE: null,
      targetDuration,
      targetDistance,
      actualReps: null,
      actualWeight: null,
      actualRPE: null,
      actualDuration: null,
      actualDistance: null,
      completed: false,
      skipped: false,
      painSignal: null,
    }))
    await db.setInstances.bulkAdd(setRows)

    await db.workouts.update(workoutId, { lastEditedAt: new Date() })
  })

  return instId
}

/**
 * Remove an exercise instance (and its sets) from a draft. Also reorders the
 * remaining exercises in the block.
 */
export async function removeExerciseFromDraft(instanceId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.exerciseInstances, db.setInstances, db.workoutBlocks, db.workouts],
    async () => {
      const instance = await db.exerciseInstances.get(instanceId)
      if (!instance) return

      const sets = await db.setInstances
        .where('exerciseInstanceId').equals(instanceId)
        .primaryKeys()
      await db.setInstances.bulkDelete(sets as string[])
      await db.exerciseInstances.delete(instanceId)

      // Reorder remaining instances in the block.
      const remaining = await db.exerciseInstances
        .where('blockId').equals(instance.blockId)
        .sortBy('order')
      await Promise.all(
        remaining.map((inst, idx) =>
          inst.order === idx ? null : db.exerciseInstances.update(inst.id, { order: idx })
        )
      )

      // Touch the workout's lastEditedAt.
      const block = await db.workoutBlocks.get(instance.blockId)
      if (block) {
        await db.workouts.update(block.workoutId, { lastEditedAt: new Date() })
      }
    }
  )
}

/**
 * Patch a single SetInstance (used both during planning to update targets and
 * during execution to log actuals).
 */
export async function updateSetInstance(
  setId: string,
  patch: Partial<SetInstance>
): Promise<void> {
  await db.setInstances.update(setId, patch)

  // Touch the parent workout's lastEditedAt — best-effort traversal.
  const set = await db.setInstances.get(setId)
  if (!set) return
  const instance = await db.exerciseInstances.get(set.exerciseInstanceId)
  if (!instance) return
  const block = await db.workoutBlocks.get(instance.blockId)
  if (!block) return
  await db.workouts.update(block.workoutId, { lastEditedAt: new Date() })
}

/**
 * Append a single set to an exercise instance. Used during execution when the
 * user wants to add a bonus set on the fly. Returns the new set's id.
 */
export async function appendSetToExercise(instanceId: string): Promise<string | null> {
  const existing = await db.setInstances
    .where('exerciseInstanceId').equals(instanceId)
    .sortBy('setNumber')
  if (existing.length === 0) return null

  const template = existing[existing.length - 1]
  const newSet: SetInstance = {
    id: crypto.randomUUID(),
    exerciseInstanceId: instanceId,
    setNumber: template.setNumber + 1,
    setType: 'working',
    targetReps: template.targetReps,
    targetWeight: template.targetWeight,
    targetRPE: template.targetRPE,
    targetDuration: template.targetDuration,
    targetDistance: template.targetDistance ?? null,
    actualReps: null,
    actualWeight: null,
    actualRPE: null,
    actualDuration: null,
    actualDistance: null,
    completed: false,
    skipped: false,
    painSignal: null,
  }
  await db.setInstances.add(newSet)

  const instance = await db.exerciseInstances.get(instanceId)
  if (instance) {
    const block = await db.workoutBlocks.get(instance.blockId)
    if (block) await db.workouts.update(block.workoutId, { lastEditedAt: new Date() })
  }
  return newSet.id
}

/**
 * Prepend ramp-up warmup sets to an exercise, computed from a working weight.
 * Existing sets are renumbered to sit after the warmups. No-op if the scheme is
 * empty (e.g. no working weight yet). Returns the number of warmups added.
 */
export async function addWarmupSets(
  instanceId: string,
  workingWeight: number,
  unit: 'lbs' | 'kg'
): Promise<number> {
  const scheme = generateWarmupSets(workingWeight, unit)
  if (scheme.length === 0) return 0

  return db.transaction('rw', [db.setInstances, db.exerciseInstances, db.workoutBlocks, db.workouts], async () => {
    const existing = await db.setInstances
      .where('exerciseInstanceId').equals(instanceId)
      .sortBy('setNumber')

    // Shift existing sets down to make room for the warmups at the front.
    for (let i = existing.length - 1; i >= 0; i--) {
      await db.setInstances.update(existing[i].id, { setNumber: existing[i].setNumber + scheme.length })
    }

    const warmupRows: SetInstance[] = scheme.map((w, i) => ({
      id: crypto.randomUUID(),
      exerciseInstanceId: instanceId,
      setNumber: i + 1,
      setType: 'warmup',
      targetReps: w.reps,
      targetWeight: w.weight,
      targetRPE: null,
      targetDuration: null,
      targetDistance: null,
      actualReps: null,
      actualWeight: null,
      actualRPE: null,
      actualDuration: null,
      actualDistance: null,
      completed: false,
      skipped: false,
      painSignal: null,
    }))
    await db.setInstances.bulkAdd(warmupRows)

    const instance = await db.exerciseInstances.get(instanceId)
    if (instance) {
      const block = await db.workoutBlocks.get(instance.blockId)
      if (block) await db.workouts.update(block.workoutId, { lastEditedAt: new Date() })
    }
    return scheme.length
  })
}

/**
 * Change the number of working sets for an exercise instance. Adds or removes
 * trailing SetInstances to reach the target count.
 */
export async function setExerciseSetCount(
  instanceId: string,
  newCount: number,
  defaults: { targetReps?: number | null; targetWeight?: number | null } = {}
): Promise<void> {
  if (newCount < 1) return
  await db.transaction('rw', [db.setInstances, db.exerciseInstances, db.workoutBlocks, db.workouts], async () => {
    const existing = await db.setInstances
      .where('exerciseInstanceId').equals(instanceId)
      .sortBy('setNumber')

    if (existing.length === newCount) return

    if (existing.length < newCount) {
      // Add new sets, copying targets from the last existing set as a sane default.
      const template = existing[existing.length - 1]
      const newSets = []
      for (let i = existing.length; i < newCount; i++) {
        newSets.push({
          id: crypto.randomUUID(),
          exerciseInstanceId: instanceId,
          setNumber: i + 1,
          setType: 'working' as const,
          targetReps: defaults.targetReps ?? template?.targetReps ?? null,
          targetWeight: defaults.targetWeight ?? template?.targetWeight ?? null,
          targetRPE: template?.targetRPE ?? null,
          targetDuration: template?.targetDuration ?? null,
          targetDistance: template?.targetDistance ?? null,
          actualReps: null,
          actualWeight: null,
          actualRPE: null,
          actualDuration: null,
          actualDistance: null,
          completed: false,
          skipped: false,
          painSignal: null,
        })
      }
      await db.setInstances.bulkAdd(newSets)
    } else {
      // Trim trailing sets.
      const toRemove = existing.slice(newCount).map(s => s.id)
      await db.setInstances.bulkDelete(toRemove)
    }

    const instance = await db.exerciseInstances.get(instanceId)
    if (instance) {
      const block = await db.workoutBlocks.get(instance.blockId)
      if (block) await db.workouts.update(block.workoutId, { lastEditedAt: new Date() })
    }
  })
}

// Maximum number of exercises allowed in a single superset group.
export const SUPERSET_MAX_MEMBERS = 5

/**
 * Add an exercise to a superset group. If groupId is null, creates a new group
 * with this exercise as its sole member. If the group already has the maximum
 * members, no-op.
 */
export async function addExerciseToSuperset(
  instanceId: string,
  groupId: string | null
): Promise<string | null> {
  const inst = await db.exerciseInstances.get(instanceId)
  if (!inst) return null

  if (groupId) {
    const count = await db.exerciseInstances
      .where('supersetGroupId').equals(groupId)
      .count()
    if (count >= SUPERSET_MAX_MEMBERS) return groupId // group is full
  }

  const newGroup = groupId ?? crypto.randomUUID()
  await db.exerciseInstances.update(instanceId, { supersetGroupId: newGroup })
  return newGroup
}

/**
 * Remove an exercise from its superset group. If only one member remains in the
 * group after removal, that member is also cleared (a "group" of 1 is just a
 * solo exercise).
 */
export async function removeExerciseFromSuperset(instanceId: string): Promise<void> {
  const inst = await db.exerciseInstances.get(instanceId)
  if (!inst || !inst.supersetGroupId) return

  const groupId = inst.supersetGroupId
  await db.exerciseInstances.update(instanceId, { supersetGroupId: null })

  const remaining = await db.exerciseInstances
    .where('supersetGroupId').equals(groupId)
    .toArray()
  if (remaining.length === 1) {
    await db.exerciseInstances.update(remaining[0].id, { supersetGroupId: null })
  }
}

/**
 * Reorder exercises within a block.
 */
export async function reorderExercises(blockId: string, orderedInstanceIds: string[]): Promise<void> {
  await db.transaction('rw', [db.exerciseInstances, db.workoutBlocks, db.workouts], async () => {
    await Promise.all(
      orderedInstanceIds.map((id, idx) => db.exerciseInstances.update(id, { order: idx }))
    )
    const block = await db.workoutBlocks.get(blockId)
    if (block) await db.workouts.update(block.workoutId, { lastEditedAt: new Date() })
  })
}

/**
 * Patch workout-level fields (name, scheduledDate, etc.). Touches lastEditedAt.
 */
export async function patchWorkout(workoutId: string, patch: Partial<Workout>): Promise<void> {
  await db.workouts.update(workoutId, { ...patch, lastEditedAt: new Date() })
}

/**
 * Promote a draft into a scheduled workout. Optionally set a date.
 */
export async function scheduleDraft(workoutId: string, scheduledDate: Date, name?: string): Promise<void> {
  const patch: Partial<Workout> = {
    status: 'planned',
    scheduledDate,
    dayOfWeek: scheduledDate.getDay(),
    lastEditedAt: new Date(),
  }
  if (name) patch.name = name
  await db.workouts.update(workoutId, patch)
}

/**
 * Flip a draft/planned workout into in_progress. Idempotent — safe to call
 * twice (the second call is a no-op).
 */
export async function promoteToInProgress(workoutId: string): Promise<void> {
  const w = await db.workouts.get(workoutId)
  if (!w) return
  if (w.status === 'completed') return

  // Backfill startedAt even for workouts already in_progress (e.g. sessions
  // started before the session clock existed) so the elapsed clock has an anchor.
  const patch: Partial<Workout> = {}
  if (w.status !== 'in_progress') {
    patch.status = 'in_progress'
    patch.lastEditedAt = new Date()
  }
  if (!w.startedAt) patch.startedAt = new Date()

  if (Object.keys(patch).length > 0) {
    await db.workouts.update(workoutId, patch)
  }
}

/**
 * Compute today's readiness for a user from their most recent daily check-in
 * plus a light recent-training-load signal. Returns null if there's no check-in
 * today (caller decides how to handle — typically: don't scale, prompt to log).
 * Fully local — no API calls.
 */
export async function getReadiness(userId: string): Promise<ReadinessResult | null> {
  const checkIn = await getTodaysCheckIn(userId)
  if (!checkIn) return null

  // Recent fatigue proxy: workouts completed in the last ~2 days.
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  const recentWorkouts = await db.workouts
    .where('userId').equals(userId)
    .filter(w => w.status === 'completed' && w.completedAt != null && new Date(w.completedAt) >= twoDaysAgo)
    .count()

  return computeReadinessScore({
    sleepQuality: checkIn.sleepQuality,
    sleepHours: checkIn.sleepHours,
    stress: checkIn.stress,
    soreness: checkIn.soreness,
    energy: checkIn.energy,
    motivation: checkIn.motivation,
    recentWorkouts2d: recentWorkouts,
  })
}

/**
 * Prefill each strength set's target weight/reps from the user's last session
 * for that exercise. On a high-readiness day this applies RPE-aware progressive
 * overload; on a low-readiness day loads are held or trimmed (see
 * recommendedSetWeight). Only fills targets that are currently empty (null) —
 * never overwrites weights the user explicitly planned. Cardio is skipped.
 * Intended to run once, when a workout is first opened for execution.
 */
export async function prefillTargetsFromHistory(workoutId: string): Promise<void> {
  const workout = await db.workouts.get(workoutId)
  if (!workout) return
  const userId = workout.userId

  const blocks = await db.workoutBlocks.where('workoutId').equals(workoutId).toArray()
  if (blocks.length === 0) return
  const blockIds = blocks.map(b => b.id)

  const instances = await db.exerciseInstances.where('blockId').anyOf(blockIds).toArray()
  if (instances.length === 0) return

  const readiness = await getReadiness(userId)
  const recommendation = readiness?.recommendation ?? null

  const exerciseMap = await resolveExercises([...new Set(instances.map(i => i.exerciseId))])

  for (const inst of instances) {
    const exercise = exerciseMap.get(inst.exerciseId)
    if (getExerciseInputKind(exercise) === 'cardio') continue

    const last = await getLastWorkoutForExercise(userId, inst.exerciseId)
    if (!last) continue

    const sets = await db.setInstances.where('exerciseInstanceId').equals(inst.id).toArray()
    for (const s of sets) {
      if (s.completed || s.setType === 'warmup') continue
      const patch: Partial<SetInstance> = {}
      if (s.targetReps == null) patch.targetReps = last.reps
      if (s.targetWeight == null) {
        const targetReps = s.targetReps ?? last.reps
        patch.targetWeight = recommendedSetWeight(recommendation, last, targetReps ?? undefined)
      }
      if (Object.keys(patch).length > 0) {
        await db.setInstances.update(s.id, patch)
      }
    }
  }
}

/**
 * Finalize a completed workout: compute the real session duration from
 * startedAt → completedAt, and record a lift record (best completed set per
 * strength exercise) so PRs and last-session memory populate. Returns any newly
 * unlocked PR achievements so the caller can surface them. Best-effort — a
 * failure here should never block workout completion.
 */
export async function recordWorkoutResults(workoutId: string): Promise<AchievementId[]> {
  const details = await getWorkoutWithDetails(workoutId)
  if (!details) return []
  const userId = details.userId

  // Real session duration (minutes), anchored on startedAt.
  const startMs = details.startedAt ? new Date(details.startedAt).getTime() : null
  const endMs = details.completedAt ? new Date(details.completedAt).getTime() : Date.now()
  if (startMs != null && endMs > startMs) {
    const minutes = Math.max(1, Math.round((endMs - startMs) / 60000))
    await db.workouts.update(workoutId, { totalDuration: minutes })
  }

  // Best completed strength set per exercise → one lift record each.
  const bestByExercise = new Map<string, { weight: number; reps: number; rpe: number | null; e1rm: number }>()
  for (const block of details.blocks) {
    for (const ex of block.exercises) {
      if (getExerciseInputKind(ex.exercise) === 'cardio') continue
      for (const s of ex.sets) {
        if (s.setType === 'warmup') continue
        if (!s.completed || s.actualWeight == null || s.actualReps == null) continue
        const e1rm = calculateE1RM(s.actualWeight, s.actualReps)
        const cur = bestByExercise.get(ex.exerciseId)
        if (!cur || e1rm > cur.e1rm) {
          bestByExercise.set(ex.exerciseId, { weight: s.actualWeight, reps: s.actualReps, rpe: s.actualRPE, e1rm })
        }
      }
    }
  }

  for (const [exerciseId, best] of bestByExercise) {
    await checkAndRecordPR(userId, exerciseId, best.weight, best.reps, best.rpe)
  }

  return checkPRAchievements(userId)
}

/**
 * Discard a draft entirely (and cascade-delete its children).
 */
export async function discardDraft(workoutId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.workouts, db.workoutBlocks, db.exerciseInstances, db.setInstances],
    async () => {
      const w = await db.workouts.get(workoutId)
      if (!w) return
      if (w.status !== 'draft') return // only drafts can be silently discarded

      const blocks = await db.workoutBlocks.where('workoutId').equals(workoutId).toArray()
      const blockIds = blocks.map(b => b.id)

      const instances = await db.exerciseInstances.where('blockId').anyOf(blockIds).toArray()
      const instanceIds = instances.map(i => i.id)

      const setIds = await db.setInstances
        .where('exerciseInstanceId').anyOf(instanceIds)
        .primaryKeys()

      await db.setInstances.bulkDelete(setIds as string[])
      await db.exerciseInstances.bulkDelete(instanceIds)
      await db.workoutBlocks.bulkDelete(blockIds)
      await db.workouts.delete(workoutId)
    }
  )
}

/**
 * Get all scheduled (planned) workouts in a date range for the Dashboard.
 */
export async function getScheduledWorkouts(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<Workout[]> {
  return db.workouts
    .where('userId').equals(userId)
    .filter(w => {
      if (w.status !== 'planned') return false
      const t = new Date(w.scheduledDate).getTime()
      return t >= rangeStart.getTime() && t < rangeEnd.getTime()
    })
    .sortBy('scheduledDate')
}

// ============================================================================
// Workout Templates
// ============================================================================

/**
 * Serialize a workout's exercises (across all blocks, in order) into a reusable
 * template — set counts, shared targets, and superset grouping are preserved.
 */
export async function saveWorkoutAsTemplate(workoutId: string, name: string): Promise<string> {
  const details = await getWorkoutWithDetails(workoutId)
  if (!details) throw new Error(`Workout ${workoutId} not found`)

  // Map each real superset group id → a small stable integer key for the template.
  const groupKeys = new Map<string, number>()
  const templateExercises: TemplateExercise[] = []

  for (const block of details.blocks) {
    for (const ex of block.exercises) {
      const first = ex.sets[0]
      let groupKey: number | null = null
      if (ex.supersetGroupId) {
        if (!groupKeys.has(ex.supersetGroupId)) groupKeys.set(ex.supersetGroupId, groupKeys.size)
        groupKey = groupKeys.get(ex.supersetGroupId)!
      }
      templateExercises.push({
        exerciseId: ex.exerciseId,
        setCount: Math.max(1, ex.sets.length),
        targetReps: first?.targetReps ?? null,
        targetWeight: first?.targetWeight ?? null,
        targetRPE: first?.targetRPE ?? null,
        targetDuration: first?.targetDuration ?? null,
        targetDistance: first?.targetDistance ?? null,
        groupKey,
      })
    }
  }

  const id = crypto.randomUUID()
  await db.workoutTemplates.add({
    id,
    name: name.trim() || 'Untitled template',
    createdAt: new Date(),
    exercises: templateExercises,
  })
  return id
}

/**
 * Save a specific set of exercise instances (e.g. one superset group) as a
 * template. When more than one instance is given they're grouped into a single
 * superset so re-adding them recreates the group. Order follows instanceIds.
 */
export async function saveInstancesAsTemplate(instanceIds: string[], name: string): Promise<string> {
  const exercises: TemplateExercise[] = []
  const asSuperset = instanceIds.length > 1

  for (const instanceId of instanceIds) {
    const inst = await db.exerciseInstances.get(instanceId)
    if (!inst) continue
    const sets = await db.setInstances.where('exerciseInstanceId').equals(instanceId).sortBy('setNumber')
    const first = sets[0]
    exercises.push({
      exerciseId: inst.exerciseId,
      setCount: Math.max(1, sets.length),
      targetReps: first?.targetReps ?? null,
      targetWeight: first?.targetWeight ?? null,
      targetRPE: first?.targetRPE ?? null,
      targetDuration: first?.targetDuration ?? null,
      targetDistance: first?.targetDistance ?? null,
      groupKey: asSuperset ? 0 : null,
    })
  }

  const id = crypto.randomUUID()
  await db.workoutTemplates.add({
    id,
    name: name.trim() || 'Untitled template',
    createdAt: new Date(),
    exercises,
  })
  return id
}

/** List saved templates, most recent first. */
export async function getWorkoutTemplates(): Promise<WorkoutTemplate[]> {
  const all = await db.workoutTemplates.toArray()
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function deleteWorkoutTemplate(templateId: string): Promise<void> {
  await db.workoutTemplates.delete(templateId)
}

/**
 * Populate an existing draft workout from a template — adds each template
 * exercise (with its targets + set count) and re-creates superset groups.
 */
export async function applyTemplateToDraft(workoutId: string, templateId: string): Promise<void> {
  const template = await db.workoutTemplates.get(templateId)
  if (!template) return

  // Add every exercise first, tracking the instance id created per group key.
  const groupMembers = new Map<number, string[]>()
  for (const te of template.exercises) {
    const instId = await addExerciseToDraft(workoutId, te.exerciseId, {
      sets: te.setCount,
      targetReps: te.targetReps,
      targetWeight: te.targetWeight,
      targetDuration: te.targetDuration,
      targetDistance: te.targetDistance,
    })
    if (te.groupKey != null) {
      const list = groupMembers.get(te.groupKey) ?? []
      list.push(instId)
      groupMembers.set(te.groupKey, list)
    }
  }

  // Re-link supersets: one Dexie group id per template group key.
  for (const members of groupMembers.values()) {
    if (members.length < 2) continue
    let groupId: string | null = null
    for (const instId of members) {
      groupId = await addExerciseToSuperset(instId, groupId)
    }
  }
}
