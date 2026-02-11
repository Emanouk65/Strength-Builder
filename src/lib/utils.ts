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
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
