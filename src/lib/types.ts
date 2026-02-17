// ============================================================================
// Core Type Definitions for FORGE
// ============================================================================

// ----------------------------------------------------------------------------
// User & Preferences
// ----------------------------------------------------------------------------

export interface User {
  id: string
  name: string
  createdAt: Date
  preferences: UserPreferences
  injuryProfile: InjuryProfile
  currentPhaseId: string | null
  apiKey: string | null // Claude API key (encrypted/stored locally)
  // Biological profile for personalized programming
  biologicalProfile: BiologicalProfile
  // Fitness background for intelligent programming
  fitnessProfile: FitnessProfile
  // Streak tracking
  currentStreak: number
  longestStreak: number
  lastWorkoutDate: string | null // ISO date string for comparison
  totalWorkoutsCompleted: number
}

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'

export interface BiologicalProfile {
  gender: Gender
  dateOfBirth: Date | null // For age-based programming adjustments
  height: number | null // Stored in cm
  weight: number | null // Stored in kg
  bodyFatPercentage: number | null // Optional
  heightUnit: 'cm' | 'ft_in'
  weightUnit: 'kg' | 'lbs'
}

// Comprehensive fitness assessment profile
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type TrainingBackground = 'none' | 'casual' | 'consistent' | 'athlete'
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'elite'

export interface FitnessProfile {
  // Current activity level (outside of gym)
  activityLevel: ActivityLevel
  // Training background
  trainingBackground: TrainingBackground
  yearsTraining: number
  // What they've done before
  previousTrainingTypes: TrainingType[]
  // Current fitness self-assessment (1-10)
  currentFitnessRating: number
  // Motivation and goals
  primaryMotivation: PrimaryMotivation
  secondaryGoals: SecondaryGoal[]
  // Target areas (optional body focus)
  targetAreas: MuscleGroup[]
  // Lifestyle factors affecting training
  lifestyle: LifestyleFactors
}

export type TrainingType =
  | 'strength_training'
  | 'bodybuilding'
  | 'powerlifting'
  | 'crossfit'
  | 'calisthenics'
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'sports'
  | 'yoga'
  | 'martial_arts'
  | 'none'

export type PrimaryMotivation =
  | 'build_muscle'
  | 'lose_fat'
  | 'get_stronger'
  | 'improve_health'
  | 'boost_energy'
  | 'athletic_performance'
  | 'mental_health'
  | 'look_better'

export type SecondaryGoal =
  | 'increase_endurance'
  | 'improve_flexibility'
  | 'reduce_stress'
  | 'better_sleep'
  | 'more_confidence'
  | 'injury_prevention'
  | 'functional_fitness'

export interface LifestyleFactors {
  sleepQuality: 'poor' | 'fair' | 'good' | 'excellent'
  averageSleepHours: number
  stressLevel: 'low' | 'moderate' | 'high' | 'very_high'
  occupation: 'sedentary' | 'light_activity' | 'moderate_activity' | 'physical_labor'
  dietFocus: 'none' | 'general_healthy' | 'high_protein' | 'calorie_deficit' | 'calorie_surplus'
}

export interface UserPreferences {
  trainingDaysPerWeek: 3 | 4 | 5 | 6
  preferredDays: number[] // 0-6 (Sunday-Saturday)
  sessionDurationMinutes: 45 | 60 | 75 | 90
  primaryGoal: 'strength' | 'hypertrophy' | 'conditioning' | 'hybrid'
  experienceLevel: ExperienceLevel
  equipmentAccess: EquipmentAccess
  peakDate: Date | null
  weightUnit: 'lbs' | 'kg'
}

export type EquipmentAccess =
  | 'full_gym'        // Commercial gym with everything
  | 'home_barbell'    // Home gym with barbell, rack, bench
  | 'home_dumbbells'  // Dumbbells and basic equipment
  | 'minimal'         // Bodyweight + resistance bands
  | 'outdoor'         // Parks, outdoor spaces

// ----------------------------------------------------------------------------
// Injury Tracking
// ----------------------------------------------------------------------------

export interface InjuryProfile {
  achilles: InjuryStatus
  knees: InjuryStatus
  lowerBack: InjuryStatus
  shoulders: InjuryStatus
  elbows: InjuryStatus
  other: InjuryEntry[]
}

export interface InjuryStatus {
  severity: number // 0-10 (0 = no issue)
  isActive: boolean
  lastFlareUp: Date | null
  notes: string
  restrictions: string[]
}

export interface InjuryEntry {
  id: string
  location: string
  severity: number
  isActive: boolean
  notes: string
}

export type InjuryLocation =
  | 'achilles'
  | 'knee'
  | 'lower_back'
  | 'shoulder'
  | 'elbow'
  | 'hip'
  | 'wrist'
  | 'neck'
  | 'hamstrings'
  | 'other'

// ----------------------------------------------------------------------------
// Phase (Mesocycle)
// ----------------------------------------------------------------------------

export type PhaseType =
  | 'rebuild'           // Coming back from layoff/injury
  | 'base'              // General fitness building
  | 'strength'          // Compound focus, lower rep ranges
  | 'hypertrophy'       // Volume accumulation, moderate intensity
  | 'cut'               // Caloric deficit, maintain strength
  | 'peak'              // Pre-event peaking
  | 'deload'            // Active recovery

export interface Phase {
  id: string
  userId: string
  name: string
  type: PhaseType
  startDate: Date
  endDate: Date
  weekCount: number // Typically 4
  focus: PhaseFocus
  status: 'planned' | 'active' | 'completed'
  notes: string
}

export interface PhaseFocus {
  primaryLifts: string[] // Exercise IDs
  intensityRange: [number, number] // e.g., [70, 85] for %1RM
  volumeTarget: 'low' | 'moderate' | 'high'
  conditioningPriority: 'none' | 'low' | 'moderate' | 'high'
  aestheticFocus: string[] // Muscle groups to emphasize
}

// ----------------------------------------------------------------------------
// Week
// ----------------------------------------------------------------------------

export interface Week {
  id: string
  phaseId: string
  weekNumber: number
  startDate: Date
  plannedVolume: number // Total sets
  actualVolume: number
  fatigueScore: number | null // Calculated from reflections
  status: 'planned' | 'active' | 'completed'
}

// ----------------------------------------------------------------------------
// Workout
// ----------------------------------------------------------------------------

export type WorkoutType =
  | 'programmed'  // Part of a training phase
  | 'quick_log'   // Free-form user-logged workout
  | 'cardio'      // Cardio-only session

export interface Workout {
  id: string
  userId: string
  weekId: string | null      // null for quick_log workouts
  workoutType: WorkoutType
  dayOfWeek: number // 0-6
  scheduledDate: Date
  completedAt: Date | null
  status: 'planned' | 'in_progress' | 'completed' | 'skipped'
  name: string // e.g., "Upper A", "Lower Power", "Pull", "Morning Run"
  totalDuration: number // Minutes
  coachingNotes: string[] // LLM-generated
  skipReason: string | null
  // Cardio-specific fields (for cardio workouts)
  cardioData?: CardioWorkoutData
}

// Cardio workout data for runs, walks, cycling, etc.
export interface CardioWorkoutData {
  cardioType: CardioType
  distance: number | null      // in user's preferred unit
  distanceUnit: DistanceUnit
  duration: number             // in seconds
  pace: number | null          // seconds per unit (mile or km)
  paceUnit: PaceUnit
  calories: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  elevationGain: number | null // in feet or meters
  route: string | null         // Optional route name/description
  notes: string
}

// ----------------------------------------------------------------------------
// Quick Log Entry (Simplified logging for individual exercises)
// ----------------------------------------------------------------------------

export interface QuickLogEntry {
  id: string
  workoutId: string           // Reference to parent quick_log workout
  exerciseId: string          // Reference to Exercise library
  exerciseName: string        // Denormalized for quick display
  order: number
  sets: QuickLogSet[]
  notes: string
  supersetGroupId?: string    // Entries sharing same groupId are a superset
}

export interface QuickLogSet {
  setNumber: number
  weight: number | null
  reps: number | null
  duration: number | null     // For timed exercises (seconds)
  distance: number | null     // For cardio (in user's unit)
  rpe: number | null
  completed: boolean
}

// ----------------------------------------------------------------------------
// Workout Blocks
// ----------------------------------------------------------------------------

export type BlockType =
  | 'warmup'
  | 'power'
  | 'primary'
  | 'secondary'
  | 'conditioning'
  | 'cardio'
  | 'core'
  | 'cooldown'

export interface WorkoutBlock {
  id: string
  workoutId: string
  type: BlockType
  order: number
  timeTarget: number // Minutes
  intent: string // Brief description of block purpose
  completed: boolean
}

// ----------------------------------------------------------------------------
// Exercise Instance (Programmed exercise within a block)
// ----------------------------------------------------------------------------

export interface ExerciseInstance {
  id: string
  blockId: string
  exerciseId: string // Reference to Exercise library
  order: number
  notes: string
  substituteFor: string | null // Original exercise ID if this is a substitution
  substitutionReason: string | null
}

// ----------------------------------------------------------------------------
// Set Instance
// ----------------------------------------------------------------------------

export interface SetInstance {
  id: string
  exerciseInstanceId: string
  setNumber: number
  setType: 'working' | 'warmup' | 'dropset' | 'amrap' | 'timed'
  // Targets (prescribed)
  targetReps: number | null
  targetWeight: number | null
  targetRPE: number | null
  targetDuration: number | null // Seconds (for timed sets)
  // Actuals (logged)
  actualReps: number | null
  actualWeight: number | null
  actualRPE: number | null
  actualDuration: number | null
  // Status
  completed: boolean
  skipped: boolean
  // Pain tracking
  painSignal: PainSignal | null
}

// ----------------------------------------------------------------------------
// Pain Signal
// ----------------------------------------------------------------------------

export interface PainSignal {
  location: InjuryLocation
  severity: number // 1-10
  type: 'sharp' | 'dull' | 'tight' | 'unstable' | 'other'
  notes: string
  timestamp: Date
}

// ----------------------------------------------------------------------------
// Workout Reflection
// ----------------------------------------------------------------------------

export interface WorkoutReflection {
  id: string
  workoutId: string
  completedAt: Date
  // Core metrics (1-10 scale)
  energy: number
  performance: number
  sleepQuality: number
  sleepHours: number
  hydration: number
  nutrition: number
  stress: number
  motivation: number
  conditioningComfort: number | null // Only if conditioning was done
  overallSatisfaction: number
  // Qualitative
  painNotes: string
  winOfTheDay: string
  struggleOfTheDay: string
  freeformNotes: string
}

// ----------------------------------------------------------------------------
// Daily Check-In (Independent of workouts)
// ----------------------------------------------------------------------------

export interface DailyCheckIn {
  id: string
  userId: string
  date: string // ISO date string (YYYY-MM-DD) for easy lookup
  completedAt: Date
  // Core metrics (1-10 scale)
  energy: number
  mood: number
  sleepQuality: number
  sleepHours: number
  hydration: number
  nutrition: number
  stress: number
  motivation: number
  soreness: number
  // Qualitative
  highlight: string // Best part of the day
  challenge: string // What was difficult
  gratitude: string // What you're grateful for
  notes: string
  // Optional workout reference
  workoutId: string | null
}

// ----------------------------------------------------------------------------
// Exercise Library (Static Reference Data)
// ----------------------------------------------------------------------------

export type ExerciseCategory =
  | 'compound'
  | 'accessory'
  | 'isolation'
  | 'conditioning'
  | 'core'
  | 'mobility'
  | 'cardio'        // Running, walking, cycling, etc.
  | 'plyometric'    // Jump training
  | 'olympic'       // Olympic lifts

export type MovementPattern =
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'carry'
  | 'rotation'
  | 'conditioning'
  | 'isolation'
  | 'cardio_steady'    // Steady state cardio
  | 'cardio_intervals' // HIIT, intervals
  | 'plyometric'       // Explosive movements

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'full_body'
  | 'cardio_system'  // For cardio exercises

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'cardio_machine'
  | 'none'
  | 'ez_bar'
  | 'trap_bar'
  | 'smith_machine'
  | 'medicine_ball'
  | 'foam_roller'
  | 'suspension_trainer'  // TRX
  | 'pull_up_bar'
  | 'dip_station'
  | 'bench'
  | 'box'

// Cardio-specific types
export type CardioType =
  | 'running'
  | 'walking'
  | 'cycling'
  | 'swimming'
  | 'rowing'
  | 'elliptical'
  | 'stair_climber'
  | 'hiking'
  | 'jump_rope'
  | 'other'

export type DistanceUnit = 'miles' | 'km' | 'meters'
export type PaceUnit = 'min_per_mile' | 'min_per_km'

export interface Exercise {
  id: string
  name: string
  category: ExerciseCategory
  primaryMuscles: MuscleGroup[]
  secondaryMuscles: MuscleGroup[]
  equipment: Equipment[]
  movementPattern: MovementPattern
  injuryContraindications: InjuryLocation[]
  substitutes: string[] // Exercise IDs
  cues: string[]
  isCompound: boolean
  isUnilateral: boolean
  // Custom exercise flag
  isCustom?: boolean
  // Cardio-specific fields (only for cardio exercises)
  cardioType?: CardioType
  tracksDistance?: boolean
  tracksPace?: boolean
  tracksHeartRate?: boolean
}

// ----------------------------------------------------------------------------
// Readiness Score (Daily Assessment)
// ----------------------------------------------------------------------------

export interface ReadinessScore {
  id: string
  date: Date
  userId: string
  overallScore: number // 1-100
  components: {
    sleepScore: number
    fatigueScore: number
    stressScore: number
    injuryRisk: number
    motivationScore: number
  }
  recommendation: 'full_send' | 'moderate' | 'light' | 'rest'
  reasoning: string // LLM-generated
}

// ----------------------------------------------------------------------------
// Coaching Insight (LLM-Generated)
// ----------------------------------------------------------------------------

export interface CoachingInsight {
  id: string
  userId: string
  weekId: string | null
  workoutId: string | null
  createdAt: Date
  type: 'weekly_review' | 'workout_feedback' | 'substitution' | 'readiness' | 'alert'
  content: string
  actionable: boolean
  dismissed: boolean
}

// ----------------------------------------------------------------------------
// User Metrics (Historical Tracking)
// ----------------------------------------------------------------------------

export interface LiftRecord {
  id: string
  userId: string
  exerciseId: string
  date: Date
  weight: number
  reps: number
  rpe: number | null
  estimated1RM: number
  isPersonalRecord: boolean
  isManualEntry?: boolean // true if user entered this manually vs logged during workout
}

// ----------------------------------------------------------------------------
// App State Types
// ----------------------------------------------------------------------------

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  hapticFeedback: boolean
  restTimerSound: boolean
  defaultRestTime: number // Seconds
  showRPEGuide: boolean
}

// ----------------------------------------------------------------------------
// API Types
// ----------------------------------------------------------------------------

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachingRequest {
  type: 'weekly_insight' | 'substitution' | 'readiness' | 'workout_feedback'
  context: Record<string, unknown>
}

// ----------------------------------------------------------------------------
// Achievement System
// ----------------------------------------------------------------------------

export type AchievementId =
  // Workout milestones
  | 'first_workout'
  | 'workout_5'
  | 'workout_10'
  | 'workout_25'
  | 'workout_50'
  | 'workout_100'
  // Streak milestones
  | 'streak_3'
  | 'streak_7'
  | 'streak_14'
  | 'streak_30'
  | 'streak_60'
  | 'streak_100'
  // PR milestones
  | 'first_pr'
  | 'pr_5'
  | 'pr_10'
  | 'pr_25'
  // Phase milestones
  | 'phase_complete'
  | 'phase_5'
  // Consistency
  | 'perfect_week'
  | 'early_bird'
  | 'night_owl'
  // Special
  | 'comeback'
  | 'iron_will'

export interface Achievement {
  id: AchievementId
  name: string
  description: string
  icon: string // Emoji
  category: 'milestone' | 'streak' | 'strength' | 'consistency' | 'special'
  requirement: number // e.g., 10 for "10 workouts"
}

export interface UserAchievement {
  id: string
  userId: string
  achievementId: AchievementId
  unlockedAt: Date
  seen: boolean // Has user dismissed the notification
}
