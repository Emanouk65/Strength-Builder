// ============================================================================
// Readiness scoring — a fully local (no-API) daily readiness estimate that
// scales the day's training loads. Inputs come from the user's daily check-in
// plus a light recent-training-load signal; nothing here calls out to a model.
// ============================================================================

import { clamp } from './utils'
import { getSuggestedWeight } from './utils'

export type ReadinessRecommendation = 'full_send' | 'moderate' | 'light' | 'rest'

export interface ReadinessComponents {
  sleep: number
  fatigue: number
  stress: number
  energy: number
  motivation: number
}

export interface ReadinessResult {
  overallScore: number // 0-100
  components: ReadinessComponents
  recommendation: ReadinessRecommendation
  reasoning: string
}

export interface ReadinessInputs {
  /** 1-10 self-rated sleep quality */
  sleepQuality: number
  /** actual hours slept */
  sleepHours: number
  /** 1-10, higher = more stressed (bad) */
  stress: number
  /** 1-10, higher = more sore (bad) */
  soreness: number
  /** 1-10, higher = more energy (good) */
  energy: number
  /** 1-10, higher = more motivated (good) */
  motivation: number
  /** completed workouts in the last ~2 days (recent fatigue proxy) */
  recentWorkouts2d: number
}

// Map a 1-10 "higher is better" rating onto 0-100.
const to100 = (v: number) => (clamp(v, 1, 10) - 1) / 9 * 100
// Map a 1-10 "higher is worse" rating onto 0-100 (inverted).
const inv100 = (v: number) => 100 - to100(v)
// Map hours slept onto 0-100 (8h+ = full).
const hoursTo100 = (h: number) => clamp(h, 0, 8) / 8 * 100

/**
 * Compute a 0-100 readiness score and a training recommendation from a daily
 * check-in. Pure function — deterministic and easy to unit test.
 */
export function computeReadinessScore(inputs: ReadinessInputs): ReadinessResult {
  const sleep = 0.6 * to100(inputs.sleepQuality) + 0.4 * hoursTo100(inputs.sleepHours)
  // Soreness dominates the fatigue signal; recent back-to-back sessions nudge it down.
  const recentLoadPenalty = clamp(inputs.recentWorkouts2d, 0, 3) * 12
  const fatigue = clamp(inv100(inputs.soreness) - recentLoadPenalty, 0, 100)
  const stress = inv100(inputs.stress)
  const energy = to100(inputs.energy)
  const motivation = to100(inputs.motivation)

  const overall = Math.round(
    0.30 * sleep +
    0.25 * fatigue +
    0.20 * stress +
    0.15 * energy +
    0.10 * motivation
  )

  const recommendation: ReadinessRecommendation =
    overall >= 80 ? 'full_send' :
    overall >= 60 ? 'moderate' :
    overall >= 40 ? 'light' :
    'rest'

  return {
    overallScore: overall,
    components: { sleep, fatigue, stress, energy, motivation },
    recommendation,
    reasoning: buildReasoning({ sleep, fatigue, stress, energy, motivation }, recommendation),
  }
}

// Name the biggest limiter (or driver) so the banner reads like a coach, not a number.
function buildReasoning(c: ReadinessComponents, rec: ReadinessRecommendation): string {
  const labels: [keyof ReadinessComponents, string][] = [
    ['sleep', 'sleep'],
    ['fatigue', 'recovery'],
    ['stress', 'stress'],
    ['energy', 'energy'],
    ['motivation', 'motivation'],
  ]
  const sorted = [...labels].sort((a, b) => c[a[0]] - c[b[0]])
  const weakest = sorted[0]

  if (rec === 'full_send') return 'Everything looks good — pushing your weights up today.'
  if (rec === 'moderate') return `Solid overall, ${weakest[1]} a touch low — holding weights steady.`
  if (rec === 'light') return `Low ${weakest[1]} today — trimming loads about 10%.`
  return `Low readiness (${weakest[1]} especially) — consider rest or light mobility.`
}

/**
 * Recommended working weight for a set given readiness. On a great day we apply
 * progressive overload; otherwise we hold or trim relative to last session.
 * A null recommendation (no check-in today) defaults to normal overload.
 */
export function recommendedSetWeight(
  recommendation: ReadinessRecommendation | null,
  last: { weight: number; reps: number; rpe: number | null },
  targetReps?: number
): number {
  if (recommendation == null || recommendation === 'full_send') {
    return getSuggestedWeight(last.weight, last.reps, last.rpe, targetReps)
  }
  if (recommendation === 'moderate') return last.weight
  const factor = recommendation === 'light' ? 0.9 : 0.8
  return Math.max(0, Math.round((last.weight * factor) / 5) * 5)
}

/** Short display label + accent for each recommendation, used by the banner. */
export function readinessDisplay(rec: ReadinessRecommendation): { label: string; tone: 'good' | 'neutral' | 'warn' | 'bad' } {
  switch (rec) {
    case 'full_send': return { label: 'Full send', tone: 'good' }
    case 'moderate': return { label: 'Moderate', tone: 'neutral' }
    case 'light': return { label: 'Take it lighter', tone: 'warn' }
    case 'rest': return { label: 'Rest recommended', tone: 'bad' }
  }
}
