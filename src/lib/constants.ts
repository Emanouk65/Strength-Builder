// ============================================================================
// Application Constants
// ============================================================================

// RPE Descriptions for user reference
export const RPE_DESCRIPTIONS: Record<number, string> = {
  1: 'Very light - Could do 9+ more reps',
  2: 'Light - Could do 8+ more reps',
  3: 'Light - Could do 7+ more reps',
  4: 'Moderate - Could do 6 more reps',
  5: 'Moderate - Could do 5 more reps',
  6: 'Moderate - Could do 4 more reps',
  7: 'Somewhat hard - Could do 3 more reps',
  8: 'Hard - Could do 2 more reps',
  9: 'Very hard - Could do 1 more rep',
  10: 'Maximum effort - No reps left',
}

// Block type configurations
export const BLOCK_CONFIG = {
  warmup: {
    label: 'Warm-Up',
    description: 'Prepare your body for the work ahead',
    defaultDuration: 8,
    color: 'text-yellow-500',
  },
  power: {
    label: 'Power / Primer',
    description: 'Explosive movements to activate the nervous system',
    defaultDuration: 5,
    color: 'text-purple-500',
  },
  primary: {
    label: 'Primary Compound',
    description: 'Main strength work - focus and intent',
    defaultDuration: 20,
    color: 'text-primary',
  },
  secondary: {
    label: 'Accessory Work',
    description: 'Support movements and isolation',
    defaultDuration: 15,
    color: 'text-blue-500',
  },
  conditioning: {
    label: 'Conditioning',
    description: 'Build your engine',
    defaultDuration: 12,
    color: 'text-green-500',
  },
  cardio: {
    label: 'Cardio',
    description: 'Cardiovascular training',
    defaultDuration: 15,
    color: 'text-green-400',
  },
  core: {
    label: 'Core',
    description: 'Stability and strength through the trunk',
    defaultDuration: 5,
    color: 'text-cyan-500',
  },
  cooldown: {
    label: 'Cool-Down',
    description: 'Return to baseline, mobility work',
    defaultDuration: 5,
    color: 'text-gray-400',
  },
} as const

// Phase type configurations
export const PHASE_CONFIG = {
  rebuild: {
    label: 'Rebuild',
    description: 'Coming back from layoff or injury. Conservative loading, re-establish patterns.',
    defaultWeeks: 3,
    intensityRange: [50, 70] as [number, number],
    volumeTarget: 'moderate' as const,
    rpeTarget: [5, 7] as [number, number],
  },
  base: {
    label: 'Base Building',
    description: 'General fitness foundation. Balanced approach, aerobic work.',
    defaultWeeks: 4,
    intensityRange: [60, 75] as [number, number],
    volumeTarget: 'high' as const,
    rpeTarget: [6, 8] as [number, number],
  },
  strength: {
    label: 'Strength',
    description: 'Compound focus, lower rep ranges, progressive overload.',
    defaultWeeks: 4,
    intensityRange: [75, 90] as [number, number],
    volumeTarget: 'moderate' as const,
    rpeTarget: [7, 9] as [number, number],
  },
  hypertrophy: {
    label: 'Hypertrophy',
    description: 'Volume accumulation, moderate intensity, time under tension.',
    defaultWeeks: 4,
    intensityRange: [65, 80] as [number, number],
    volumeTarget: 'high' as const,
    rpeTarget: [7, 9] as [number, number],
  },
  cut: {
    label: 'Cut / Maintain',
    description: 'Preserve strength during caloric deficit. Reduced volume, maintain intensity.',
    defaultWeeks: 6,
    intensityRange: [70, 85] as [number, number],
    volumeTarget: 'low' as const,
    rpeTarget: [7, 9] as [number, number],
  },
  peak: {
    label: 'Peak',
    description: 'Preparing for a specific date. Reduce volume, sharpen performance.',
    defaultWeeks: 2,
    intensityRange: [85, 95] as [number, number],
    volumeTarget: 'low' as const,
    rpeTarget: [8, 10] as [number, number],
  },
  deload: {
    label: 'Deload',
    description: 'Active recovery. 50% volume, light intensity, movement quality.',
    defaultWeeks: 1,
    intensityRange: [50, 65] as [number, number],
    volumeTarget: 'low' as const,
    rpeTarget: [4, 6] as [number, number],
  },
} as const

// Injury location display names and body map positions
export const INJURY_LOCATIONS = {
  achilles: { label: 'Achilles', bodyPart: 'Lower Leg' },
  knee: { label: 'Knee', bodyPart: 'Leg' },
  lower_back: { label: 'Lower Back', bodyPart: 'Back' },
  shoulder: { label: 'Shoulder', bodyPart: 'Upper Body' },
  elbow: { label: 'Elbow', bodyPart: 'Arm' },
  hip: { label: 'Hip', bodyPart: 'Lower Body' },
  wrist: { label: 'Wrist', bodyPart: 'Arm' },
  neck: { label: 'Neck', bodyPart: 'Upper Body' },
  other: { label: 'Other', bodyPart: 'Other' },
} as const

// Default rest times by exercise category (seconds)
export const DEFAULT_REST_TIMES = {
  compound: 180, // 3 min
  accessory: 90,  // 1.5 min
  isolation: 60,  // 1 min
  conditioning: 30, // 30 sec
  core: 60, // 1 min
  mobility: 30, // 30 sec
} as const

// Standard progression rules
export const PROGRESSION_RULES = {
  // If all sets completed at target RPE or below, increase weight
  loadIncrease: {
    barbell: 5, // lbs
    dumbbell: 2.5, // lbs per hand
    cable: 5, // lbs
    machine: 5, // lbs
  },
  // RPE thresholds
  underRecoveredThreshold: 9.5, // Average RPE above this = too hard
  overRecoveredThreshold: 6.5, // Average RPE below this = too easy
  // Volume adjustments
  volumeIncreasePercent: 10,
  volumeDecreasePercent: 20,
} as const

// Workout split templates
export const SPLIT_TEMPLATES = {
  upperLower4: {
    name: 'Upper/Lower (4 days)',
    days: ['Upper A', 'Lower A', 'Rest', 'Upper B', 'Lower B', 'Rest', 'Rest'],
  },
  pushPullLegs: {
    name: 'Push/Pull/Legs (6 days)',
    days: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'],
  },
  upperLower5: {
    name: 'Upper/Lower (5 days)',
    days: ['Upper A', 'Lower A', 'Upper B', 'Rest', 'Lower B', 'Full Body', 'Rest'],
  },
  fullBody3: {
    name: 'Full Body (3 days)',
    days: ['Full Body A', 'Rest', 'Full Body B', 'Rest', 'Full Body C', 'Rest', 'Rest'],
  },
} as const

// Reflection prompts
export const REFLECTION_PROMPTS = {
  winOfTheDay: [
    'What went well today?',
    'What are you proud of from this session?',
    'What movement felt strongest?',
    'What progress did you notice?',
  ],
  struggleOfTheDay: [
    'What was challenging?',
    'What would you do differently?',
    'Where did you have to dig deep?',
    'What needs attention next session?',
  ],
} as const

// Time zones for session scheduling
export const SESSION_TIMES = {
  earlyMorning: { label: 'Early Morning', hours: [5, 6, 7] },
  morning: { label: 'Morning', hours: [8, 9, 10] },
  midday: { label: 'Midday', hours: [11, 12, 13] },
  afternoon: { label: 'Afternoon', hours: [14, 15, 16] },
  evening: { label: 'Evening', hours: [17, 18, 19] },
  night: { label: 'Night', hours: [20, 21, 22] },
} as const

// ============================================================================
// Achievement System
// ============================================================================

import type { Achievement, AchievementId } from './types'

export const ACHIEVEMENTS: Record<AchievementId, Achievement> = {
  // Workout milestones
  first_workout: {
    id: 'first_workout',
    name: 'First Forge',
    description: 'Complete your first workout',
    icon: '🔨',
    category: 'milestone',
    requirement: 1,
  },
  workout_5: {
    id: 'workout_5',
    name: 'Getting Started',
    description: 'Complete 5 workouts',
    icon: '💪',
    category: 'milestone',
    requirement: 5,
  },
  workout_10: {
    id: 'workout_10',
    name: 'Double Digits',
    description: 'Complete 10 workouts',
    icon: '🔥',
    category: 'milestone',
    requirement: 10,
  },
  workout_25: {
    id: 'workout_25',
    name: 'Quarter Century',
    description: 'Complete 25 workouts',
    icon: '⚡',
    category: 'milestone',
    requirement: 25,
  },
  workout_50: {
    id: 'workout_50',
    name: 'Half Century',
    description: 'Complete 50 workouts',
    icon: '🏆',
    category: 'milestone',
    requirement: 50,
  },
  workout_100: {
    id: 'workout_100',
    name: 'Centurion',
    description: 'Complete 100 workouts',
    icon: '👑',
    category: 'milestone',
    requirement: 100,
  },

  // Streak milestones
  streak_3: {
    id: 'streak_3',
    name: 'Hat Trick',
    description: 'Maintain a 3-day streak',
    icon: '🎯',
    category: 'streak',
    requirement: 3,
  },
  streak_7: {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    icon: '📅',
    category: 'streak',
    requirement: 7,
  },
  streak_14: {
    id: 'streak_14',
    name: 'Fortnight Fighter',
    description: 'Maintain a 14-day streak',
    icon: '⚔️',
    category: 'streak',
    requirement: 14,
  },
  streak_30: {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day streak',
    icon: '🌟',
    category: 'streak',
    requirement: 30,
  },
  streak_60: {
    id: 'streak_60',
    name: 'Iron Discipline',
    description: 'Maintain a 60-day streak',
    icon: '🔱',
    category: 'streak',
    requirement: 60,
  },
  streak_100: {
    id: 'streak_100',
    name: 'Unstoppable',
    description: 'Maintain a 100-day streak',
    icon: '💎',
    category: 'streak',
    requirement: 100,
  },

  // PR milestones
  first_pr: {
    id: 'first_pr',
    name: 'Record Breaker',
    description: 'Set your first personal record',
    icon: '🎖️',
    category: 'strength',
    requirement: 1,
  },
  pr_5: {
    id: 'pr_5',
    name: 'PR Hunter',
    description: 'Set 5 personal records',
    icon: '🏅',
    category: 'strength',
    requirement: 5,
  },
  pr_10: {
    id: 'pr_10',
    name: 'Strength Rising',
    description: 'Set 10 personal records',
    icon: '🥇',
    category: 'strength',
    requirement: 10,
  },
  pr_25: {
    id: 'pr_25',
    name: 'PR Machine',
    description: 'Set 25 personal records',
    icon: '🏛️',
    category: 'strength',
    requirement: 25,
  },

  // Phase milestones
  phase_complete: {
    id: 'phase_complete',
    name: 'Phase One',
    description: 'Complete your first training phase',
    icon: '📈',
    category: 'milestone',
    requirement: 1,
  },
  phase_5: {
    id: 'phase_5',
    name: 'Seasoned Athlete',
    description: 'Complete 5 training phases',
    icon: '🎓',
    category: 'milestone',
    requirement: 5,
  },

  // Consistency
  perfect_week: {
    id: 'perfect_week',
    name: 'Perfect Week',
    description: 'Complete all planned workouts in a week',
    icon: '✨',
    category: 'consistency',
    requirement: 1,
  },
  early_bird: {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Complete a workout before 7am',
    icon: '🌅',
    category: 'consistency',
    requirement: 1,
  },
  night_owl: {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Complete a workout after 9pm',
    icon: '🌙',
    category: 'consistency',
    requirement: 1,
  },

  // Special
  comeback: {
    id: 'comeback',
    name: 'Comeback',
    description: 'Return to training after 7+ days off',
    icon: '🔄',
    category: 'special',
    requirement: 1,
  },
  iron_will: {
    id: 'iron_will',
    name: 'Iron Will',
    description: 'Complete a workout with energy rating below 5',
    icon: '🦾',
    category: 'special',
    requirement: 1,
  },
}

// Streak messages based on streak length
export const STREAK_MESSAGES: Record<number, string> = {
  1: "Day 1 - Every journey starts here",
  2: "Day 2 - You came back",
  3: "3 days strong - Building momentum",
  5: "5 days - You're on fire",
  7: "One week! Habits are forming",
  10: "Double digits - You're committed",
  14: "Two weeks of consistency",
  21: "3 weeks - This is who you are now",
  30: "A full month. Incredible.",
  50: "50 days - Truly dedicated",
  75: "75 days - Elite consistency",
  100: "100 DAYS. Legendary.",
}

// Get appropriate streak message
export function getStreakMessage(streak: number): string {
  const thresholds = Object.keys(STREAK_MESSAGES)
    .map(Number)
    .sort((a, b) => b - a)

  for (const threshold of thresholds) {
    if (streak >= threshold) {
      return STREAK_MESSAGES[threshold]
    }
  }
  return "Keep going"
}

// ============================================================================
// Quick Workout Templates
// ============================================================================

export type QuickWorkoutType =
  // Split-based
  | 'push'
  | 'pull'
  | 'legs'
  | 'upper'
  | 'lower'
  | 'full_body'
  | 'arms'
  | 'core'
  | 'back'
  | 'chest'
  | 'shoulders'
  // Goal-based
  | 'strength'
  | 'hypertrophy'
  | 'conditioning'
  | 'mobility'
  | 'quick_burn'

export interface QuickWorkoutTemplate {
  name: string
  description: string
  icon: string
  category: 'split' | 'goal'
  muscles?: string[]          // For split-based: target muscle groups
  exerciseCount: number       // How many exercises to generate
  setsPerExercise: number     // Default sets per exercise
  repRange: [number, number]  // Target rep range
  includeCompound?: boolean   // Prioritize compound movements
  duration?: number           // Estimated duration in minutes
}

export const QUICK_WORKOUT_TEMPLATES: Record<QuickWorkoutType, QuickWorkoutTemplate> = {
  // Split-based workouts
  push: {
    name: 'Push',
    description: 'Chest, shoulders, triceps',
    icon: '🫸',
    category: 'split',
    muscles: ['chest', 'shoulders', 'triceps'],
    exerciseCount: 5,
    setsPerExercise: 3,
    repRange: [8, 12],
    includeCompound: true,
    duration: 45,
  },
  pull: {
    name: 'Pull',
    description: 'Back, biceps, rear delts',
    icon: '🫷',
    category: 'split',
    muscles: ['back', 'biceps'],
    exerciseCount: 5,
    setsPerExercise: 3,
    repRange: [8, 12],
    includeCompound: true,
    duration: 45,
  },
  legs: {
    name: 'Legs',
    description: 'Quads, hamstrings, glutes, calves',
    icon: '🦵',
    category: 'split',
    muscles: ['quads', 'hamstrings', 'glutes', 'calves'],
    exerciseCount: 5,
    setsPerExercise: 3,
    repRange: [8, 12],
    includeCompound: true,
    duration: 50,
  },
  upper: {
    name: 'Upper Body',
    description: 'Complete upper body workout',
    icon: '💪',
    category: 'split',
    muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
    exerciseCount: 6,
    setsPerExercise: 3,
    repRange: [8, 12],
    includeCompound: true,
    duration: 55,
  },
  lower: {
    name: 'Lower Body',
    description: 'Complete lower body workout',
    icon: '🏃',
    category: 'split',
    muscles: ['quads', 'hamstrings', 'glutes', 'calves'],
    exerciseCount: 5,
    setsPerExercise: 3,
    repRange: [8, 12],
    includeCompound: true,
    duration: 50,
  },
  full_body: {
    name: 'Full Body',
    description: 'Hit every muscle group',
    icon: '🏋️',
    category: 'split',
    muscles: ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'core'],
    exerciseCount: 6,
    setsPerExercise: 3,
    repRange: [8, 12],
    includeCompound: true,
    duration: 60,
  },
  arms: {
    name: 'Arms',
    description: 'Biceps, triceps, forearms',
    icon: '💪',
    category: 'split',
    muscles: ['biceps', 'triceps', 'forearms'],
    exerciseCount: 5,
    setsPerExercise: 3,
    repRange: [10, 15],
    includeCompound: false,
    duration: 35,
  },
  core: {
    name: 'Core',
    description: 'Abs and trunk stability',
    icon: '🔥',
    category: 'split',
    muscles: ['core'],
    exerciseCount: 5,
    setsPerExercise: 3,
    repRange: [12, 20],
    includeCompound: false,
    duration: 25,
  },
  back: {
    name: 'Back',
    description: 'Lats, traps, rhomboids',
    icon: '🦍',
    category: 'split',
    muscles: ['back'],
    exerciseCount: 5,
    setsPerExercise: 3,
    repRange: [8, 12],
    includeCompound: true,
    duration: 40,
  },
  chest: {
    name: 'Chest',
    description: 'Pecs from all angles',
    icon: '🎯',
    category: 'split',
    muscles: ['chest'],
    exerciseCount: 5,
    setsPerExercise: 3,
    repRange: [8, 12],
    includeCompound: true,
    duration: 40,
  },
  shoulders: {
    name: 'Shoulders',
    description: 'Delts and traps',
    icon: '🏔️',
    category: 'split',
    muscles: ['shoulders'],
    exerciseCount: 5,
    setsPerExercise: 3,
    repRange: [10, 15],
    includeCompound: true,
    duration: 35,
  },

  // Goal-based workouts
  strength: {
    name: 'Strength',
    description: 'Heavy compounds, lower reps',
    icon: '🏆',
    category: 'goal',
    exerciseCount: 4,
    setsPerExercise: 5,
    repRange: [3, 6],
    includeCompound: true,
    duration: 60,
  },
  hypertrophy: {
    name: 'Hypertrophy',
    description: 'Volume focus, muscle growth',
    icon: '📈',
    category: 'goal',
    exerciseCount: 6,
    setsPerExercise: 4,
    repRange: [8, 12],
    includeCompound: true,
    duration: 55,
  },
  conditioning: {
    name: 'Conditioning',
    description: 'Circuits and supersets',
    icon: '⚡',
    category: 'goal',
    exerciseCount: 8,
    setsPerExercise: 3,
    repRange: [12, 20],
    includeCompound: false,
    duration: 40,
  },
  mobility: {
    name: 'Mobility',
    description: 'Stretching and movement',
    icon: '🧘',
    category: 'goal',
    muscles: ['full_body'],
    exerciseCount: 6,
    setsPerExercise: 2,
    repRange: [10, 15],
    includeCompound: false,
    duration: 30,
  },
  quick_burn: {
    name: 'Quick Burn',
    description: 'Fast, intense 15-minute workout',
    icon: '🔥',
    category: 'goal',
    exerciseCount: 4,
    setsPerExercise: 3,
    repRange: [12, 15],
    includeCompound: true,
    duration: 15,
  },
}

// Major lifts for PR tracking
export const MAJOR_LIFTS = [
  { id: 'barbell-back-squat', name: 'Back Squat', icon: '🏋️' },
  { id: 'barbell-bench-press', name: 'Bench Press', icon: '💪' },
  { id: 'conventional-deadlift', name: 'Deadlift', icon: '🦍' },
  { id: 'overhead-press', name: 'Overhead Press', icon: '🏔️' },
  { id: 'barbell-row', name: 'Barbell Row', icon: '🚣' },
  { id: 'front-squat', name: 'Front Squat', icon: '🏋️' },
  { id: 'sumo-deadlift', name: 'Sumo Deadlift', icon: '🦍' },
  { id: 'incline-bench-press', name: 'Incline Bench', icon: '💪' },
  { id: 'pull-up', name: 'Pull-up', icon: '🧗' },
  { id: 'dip', name: 'Dip', icon: '⬇️' },
]
