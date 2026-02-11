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
  QuickLogEntry,
  DailyCheckIn,
} from '@/lib/types'

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
  quickLogEntries!: EntityTable<QuickLogEntry, 'id'>
  dailyCheckIns!: EntityTable<DailyCheckIn, 'id'>

  constructor() {
    super('ForgeDB')

    this.version(3).stores({
      // User table - one user for local-first approach
      users: 'id, createdAt',

      // Phase (mesocycle) table
      phases: 'id, userId, status, startDate, endDate, type',

      // Week table
      weeks: 'id, phaseId, weekNumber, startDate, status',

      // Workout table - indexed for quick daily lookups
      // Now supports quick_log and cardio workouts with userId index
      workouts: 'id, userId, weekId, workoutType, scheduledDate, status, dayOfWeek, completedAt',

      // Workout blocks - ordered within a workout
      workoutBlocks: 'id, workoutId, type, order',

      // Exercise instances within blocks
      exerciseInstances: 'id, blockId, exerciseId, order',

      // Set instances within exercise instances
      setInstances: 'id, exerciseInstanceId, setNumber, completed',

      // Workout reflections - one per workout
      workoutReflections: 'id, workoutId, completedAt',

      // Exercise library - static reference data
      exercises: 'id, name, category, movementPattern, *primaryMuscles, *equipment, cardioType',

      // Daily readiness scores
      readinessScores: 'id, userId, date',

      // Coaching insights from LLM
      coachingInsights: 'id, userId, weekId, workoutId, createdAt, type, dismissed',

      // Historical lift records for tracking progress
      liftRecords: 'id, userId, exerciseId, date, isPersonalRecord',

      // User achievements
      userAchievements: 'id, userId, achievementId, unlockedAt, seen',

      // Quick log entries - for free-form workout logging
      quickLogEntries: 'id, workoutId, exerciseId, order',

      // Daily check-ins - independent of workouts, for tracking daily wellness
      dailyCheckIns: 'id, userId, date, completedAt, workoutId',
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

  const blocksWithExercises = await Promise.all(
    blocks.map(async block => {
      const instances = await db.exerciseInstances
        .where('blockId')
        .equals(block.id)
        .sortBy('order')

      const instancesWithSets = await Promise.all(
        instances.map(async instance => {
          const exercise = await db.exercises.get(instance.exerciseId)
          const sets = await db.setInstances
            .where('exerciseInstanceId')
            .equals(instance.id)
            .sortBy('setNumber')

          return {
            ...instance,
            exercise,
            sets,
          }
        })
      )

      return {
        ...block,
        exercises: instancesWithSets,
      }
    })
  )

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
 * Record a personal record
 */
export async function checkAndRecordPR(
  userId: string,
  exerciseId: string,
  weight: number,
  reps: number,
  rpe: number | null
): Promise<boolean> {
  // Epley formula for estimated 1RM
  const estimated1RM = reps === 1 ? weight : weight * (1 + reps / 30)

  const existingPR = await db.liftRecords
    .where({ userId, exerciseId, isPersonalRecord: true })
    .first()

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

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

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
  const prCount = await db.liftRecords
    .where({ userId, isPersonalRecord: true })
    .count()

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
  return db.userAchievements
    .where({ userId: userId, seen: false })
    .toArray()
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
  const today = new Date().toISOString().split('T')[0]
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
  const startDateStr = startDate.toISOString().split('T')[0]

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
 * Get best lift record for an exercise (for weight suggestions)
 */
export async function getBestLift(userId: string, exerciseId: string): Promise<LiftRecord | undefined> {
  return db.liftRecords
    .where({ userId, exerciseId, isPersonalRecord: true })
    .first()
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
  // Calculate estimated 1RM using Epley formula
  const estimated1RM = reps === 1 ? weight : weight * (1 + reps / 30)

  // Check if this beats the existing PR
  const existingPR = await db.liftRecords
    .where({ userId, exerciseId, isPersonalRecord: true })
    .first()

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
  return db.liftRecords
    .where({ userId, isPersonalRecord: true })
    .toArray()
}
