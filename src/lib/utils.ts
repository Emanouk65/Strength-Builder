import { clsx, type ClassValue } from 'clsx'

/**
 * Utility for combining class names with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/**
 * Format a date for display
 */
export function formatDate(date: Date, format: 'short' | 'long' | 'weekday' = 'short'): string {
  const d = new Date(date)
  switch (format) {
    case 'long':
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    case 'weekday':
      return d.toLocaleDateString('en-US', { weekday: 'short' })
    default:
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
  }
}

/**
 * Format duration in minutes
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

/**
 * Format weight with unit
 */
export function formatWeight(weight: number, unit: 'lbs' | 'kg' = 'lbs'): string {
  return `${weight} ${unit}`
}

/**
 * Get RPE color class
 */
export function getRPEColor(rpe: number): string {
  if (rpe <= 4) return 'text-rpe-low'
  if (rpe <= 6) return 'text-rpe-moderate'
  if (rpe <= 8) return 'text-rpe-high'
  return 'text-rpe-max'
}

/**
 * Get RPE background color class
 */
export function getRPEBgColor(rpe: number): string {
  if (rpe <= 4) return 'bg-rpe-low'
  if (rpe <= 6) return 'bg-rpe-moderate'
  if (rpe <= 8) return 'bg-rpe-high'
  return 'bg-rpe-max'
}

/**
 * Calculate estimated 1RM using Epley formula
 */
export function calculateE1RM(weight: number, reps: number): number {
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

/**
 * Generate a UUID
 * Falls back to a custom implementation for insecure contexts (HTTP over network)
 */
export function generateId(): string {
  // crypto.randomUUID() requires secure context (HTTPS or localhost)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for insecure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Get day name from day number
 */
export function getDayName(day: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[day] || ''
}

/**
 * Get short day name
 */
export function getShortDayName(day: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[day] || ''
}

/**
 * Check if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date()
  const d = new Date(date)
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  )
}

/**
 * Get dates for current week
 */
export function getCurrentWeekDates(): Date[] {
  const today = new Date()
  const day = today.getDay()
  const dates: Date[] = []

  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() - day + i)
    dates.push(date)
  }

  return dates
}

/**
 * Get which input fields to show for an exercise based on its movement pattern
 */
export type LogFieldType = 'weight' | 'reps' | 'duration' | 'distance' | 'rpe'

export function getExerciseLogFields(movementPattern: string, _category?: string): LogFieldType[] {
  switch (movementPattern) {
    case 'carry':
      return ['weight', 'distance', 'duration', 'rpe']
    case 'cardio_steady':
    case 'cardio_intervals':
      return ['distance', 'duration', 'rpe']
    case 'plyometric':
      return ['reps', 'rpe']
    default:
      return ['weight', 'reps', 'rpe']
  }
}

/**
 * High-level classification used by the planner + workout views to decide
 * which input fields to render for a given exercise. Cardio collapses both
 * steady-state and interval movement patterns into a single "cardio" layout
 * because both are logged the same way (duration + distance per session).
 *
 * Detection rules (any one is enough to classify as cardio):
 *  1) `category` is explicitly `cardio` (outdoor runs, walks, cycling, etc.)
 *  2) `movementPattern` is `cardio_steady` or `cardio_intervals`
 *  3) Equipment includes `cardio_machine` (treadmill, bike, rower, ski erg,
 *     stair climber, elliptical — these are tagged `category: 'conditioning'`
 *     in the library but logically belong to the cardio input flow)
 */
export type ExerciseInputKind = 'strength' | 'cardio'

export function getExerciseInputKind(
  ex: { category?: string; movementPattern?: string; equipment?: string[] } | null | undefined
): ExerciseInputKind {
  if (!ex) return 'strength'
  if (ex.category === 'cardio') return 'cardio'
  if (ex.movementPattern === 'cardio_steady' || ex.movementPattern === 'cardio_intervals') return 'cardio'
  if (Array.isArray(ex.equipment) && ex.equipment.includes('cardio_machine')) return 'cardio'
  return 'strength'
}

/**
 * The unit we display distance in. Inferred from the user's weightUnit since
 * we don't store a dedicated distanceUnit preference — lbs users get miles,
 * kg users get km. Storage is the raw number in this unit.
 */
export function distanceUnitFor(weightUnit: 'lbs' | 'kg'): 'mi' | 'km' {
  return weightUnit === 'lbs' ? 'mi' : 'km'
}

/**
 * Convert seconds → minutes for display (1 decimal). Used by cardio inputs
 * where the underlying field is stored as seconds for consistency with
 * existing target/actualDuration semantics.
 */
export function secondsToMinutes(seconds: number | null): number | null {
  if (seconds == null) return null
  return Math.round((seconds / 60) * 10) / 10
}

export function minutesToSeconds(minutes: number | null): number | null {
  if (minutes == null) return null
  return Math.round(minutes * 60)
}

/**
 * Get suggested weight based on last workout performance.
 * Progressive overload: always nudge up unless it was very hard (RPE 9-10).
 */
export function getSuggestedWeight(
  lastWeight: number,
  lastReps: number,
  lastRPE: number | null,
  targetReps?: number
): number {
  let suggestedWeight: number

  if (lastRPE === null) {
    // No RPE logged — assume it was manageable, apply small progressive overload
    suggestedWeight = lastWeight + 5
  } else if (lastRPE <= 6) {
    // Felt easy — increase more
    suggestedWeight = lastWeight + 10
  } else if (lastRPE <= 8) {
    // Good working range — small increase
    suggestedWeight = lastWeight + 5
  } else {
    // Very hard (RPE 9-10) — keep same weight
    suggestedWeight = lastWeight
  }

  // Adjust for rep range differences if target reps specified
  if (targetReps && targetReps !== lastReps && lastReps > 0) {
    const repDiff = targetReps - lastReps
    const adjustment = 1 - (repDiff * 0.025)
    suggestedWeight = Math.round(suggestedWeight * adjustment / 5) * 5
  }

  return Math.max(suggestedWeight, 0)
}

/**
 * Round a weight to the smallest plate increment for the unit (5 lb / 2.5 kg).
 */
export function roundToIncrement(value: number, unit: 'lbs' | 'kg'): number {
  const inc = unit === 'kg' ? 2.5 : 5
  return Math.round(value / inc) * inc
}

/**
 * Generate a ramp-up warmup scheme leading into a working weight. Returns
 * ascending sets (lightest first), each rounded to the plate increment, never
 * below an empty bar and never at/above the working weight.
 */
export function generateWarmupSets(
  workingWeight: number,
  unit: 'lbs' | 'kg'
): { weight: number; reps: number }[] {
  if (!Number.isFinite(workingWeight) || workingWeight <= 0) return []
  const bar = unit === 'kg' ? 20 : 45
  const scheme = [
    { pct: 0.4, reps: 8 },
    { pct: 0.6, reps: 5 },
    { pct: 0.75, reps: 3 },
    { pct: 0.9, reps: 1 },
  ]
  const out: { weight: number; reps: number }[] = []
  for (const s of scheme) {
    let w = roundToIncrement(workingWeight * s.pct, unit)
    if (w < bar) w = bar
    if (w >= workingWeight) continue
    if (out.length && out[out.length - 1].weight === w) continue
    out.push({ weight: w, reps: s.reps })
  }
  return out
}

/**
 * Get local date string in YYYY-MM-DD format (avoids UTC timezone issues with toISOString)
 */
export function getLocalDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// Motion presets — shared framer-motion variants/transitions
// ============================================================================

/**
 * Standard page transition — a tiny slide with no opacity change. Opacity-
 * based page fades caused the planner to render at low opacity on re-entry:
 * AnimatePresence with `mode="wait"` could leave the new page's enter
 * animation stuck mid-fade after a rapid navigate away & back, so cards
 * appeared dim even though they had loaded. Sliding instead of fading keeps
 * the visual polish without ever hiding the content.
 */
export const pageMotion = {
  initial: { y: 8 },
  animate: { y: 0 },
  exit: { y: -8 },
  transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const },
}

/** Container that staggers its children. Use with `cardMotion` on the children. */
export const listMotion = {
  initial: 'hidden',
  animate: 'visible',
  variants: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
  },
}

export const cardMotion = {
  variants: {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } },
  },
}

/** Bottom sheet (slide up from bottom). */
export const sheetMotion = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const },
}

/** Modal/overlay fade. */
export const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
}

/** Tap feedback for interactive elements. */
export const tapMotion = {
  whileTap: { scale: 0.97 },
  transition: { duration: 0.1 },
}
