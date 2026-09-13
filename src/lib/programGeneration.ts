import {
  db,
  getExerciseRecordSummaries,
  getCustomExercises,
  addExerciseToSuperset,
  getRecentCheckIns,
  EXERCISE_LIBRARY,
} from '@/db'
import { roundToIncrement, getLocalDateString } from '@/lib/utils'
import type {
  User,
  Exercise,
  Equipment,
  InjuryLocation,
  GeneratedProgram,
  GeneratedProgramExercise,
  Program,
  Workout,
  SetInstance,
} from '@/lib/types'

// ============================================================================
// AI program generation — Claude-powered multi-week training programs
// ============================================================================
// The user describes their goals; Claude (via the API key stored in Settings)
// returns a one-week day template plus per-week progression via a FORCED tool
// call, and FORGE expands it into concrete planned workouts that flow through
// the existing Dashboard → /workout/:id path.

/** Latest Sonnet — good quality/latency balance for program design. */
const CLAUDE_MODEL = 'claude-sonnet-4-5'
const API_URL = 'https://api.anthropic.com/v1/messages'
const CALL_TIMEOUT_MS = 120_000

export type ProgramGenerationErrorCode = 'no_api_key' | 'network' | 'api_error' | 'invalid_output'

export class ProgramGenerationError extends Error {
  code: ProgramGenerationErrorCode
  constructor(code: ProgramGenerationErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export interface GenerationResult {
  plan: GeneratedProgram
  warnings: string[]
  model: string
}

// ----------------------------------------------------------------------------
// Tool schema — forces Claude to return a validated program structure
// ----------------------------------------------------------------------------

const CREATE_PROGRAM_TOOL = {
  name: 'create_program',
  description:
    'Create a multi-week strength training program as a one-week day template plus per-week progression. Every exerciseId MUST come from the allowed exercise list in the prompt.',
  input_schema: {
    type: 'object',
    required: ['name', 'summary', 'weeksCount', 'days', 'weeklyProgression'],
    properties: {
      name: { type: 'string', description: 'Short program name, e.g. "4-Day Upper/Lower Strength"' },
      summary: { type: 'string', description: 'One-paragraph rationale for the design, addressed to the athlete' },
      weeksCount: { type: 'integer', minimum: 2, maximum: 12 },
      days: {
        type: 'array',
        minItems: 2,
        maxItems: 6,
        items: {
          type: 'object',
          required: ['name', 'exercises'],
          properties: {
            name: { type: 'string', description: 'Day name, e.g. "Upper A"' },
            exercises: {
              type: 'array',
              minItems: 3,
              maxItems: 8,
              items: {
                type: 'object',
                required: ['exerciseId', 'sets', 'reps'],
                properties: {
                  exerciseId: { type: 'string', description: 'MUST be an id from the allowed exercise list' },
                  sets: { type: 'integer', minimum: 1, maximum: 6 },
                  reps: { type: 'integer', minimum: 1, maximum: 30 },
                  percent1RM: { type: ['number', 'null'], minimum: 30, maximum: 95, description: 'Load as %1RM for main lifts; null for accessories' },
                  targetRPE: { type: ['number', 'null'], minimum: 5, maximum: 10 },
                  supersetGroup: { type: ['integer', 'null'], description: 'Same non-null integer on 2+ exercises in a day pairs them as a superset' },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
      },
      weeklyProgression: {
        type: 'array',
        items: {
          type: 'object',
          required: ['week', 'intensityMultiplier'],
          properties: {
            week: { type: 'integer', minimum: 1 },
            intensityMultiplier: { type: 'number', minimum: 0.5, maximum: 1.15, description: 'Scales all %1RM-derived weights this week' },
            repDelta: { type: 'integer', minimum: -4, maximum: 4 },
            isDeload: { type: 'boolean' },
          },
        },
      },
    },
  },
}

// ----------------------------------------------------------------------------
// Prompt context
// ----------------------------------------------------------------------------

const EQUIPMENT_BY_ACCESS: Record<string, Set<Equipment> | null> = {
  full_gym: null, // no filter
  home_barbell: new Set<Equipment>(['barbell', 'dumbbell', 'bodyweight', 'bench', 'pull_up_bar', 'band', 'kettlebell', 'none', 'box', 'ez_bar', 'dip_station']),
  home_dumbbells: new Set<Equipment>(['dumbbell', 'bodyweight', 'bench', 'band', 'kettlebell', 'none', 'pull_up_bar', 'box']),
  minimal: new Set<Equipment>(['bodyweight', 'band', 'none', 'pull_up_bar']),
  outdoor: new Set<Equipment>(['bodyweight', 'none', 'band', 'pull_up_bar', 'box']),
}

function activeInjuryLocations(user: User): InjuryLocation[] {
  const out: InjuryLocation[] = []
  const p = user.injuryProfile
  if (p.achilles?.isActive && p.achilles.severity > 0) out.push('achilles')
  if (p.knees?.isActive && p.knees.severity > 0) out.push('knee')
  if (p.lowerBack?.isActive && p.lowerBack.severity > 0) out.push('lower_back')
  if (p.shoulders?.isActive && p.shoulders.severity > 0) out.push('shoulder')
  if (p.elbows?.isActive && p.elbows.severity > 0) out.push('elbow')
  return out
}

/** Library + custom exercises the user can actually do (equipment + injuries). */
async function allowedExercises(user: User): Promise<Exercise[]> {
  const custom = await getCustomExercises()
  const all = [...EXERCISE_LIBRARY, ...custom]
  const equipmentSet = EQUIPMENT_BY_ACCESS[user.preferences.equipmentAccess] ?? null
  const injuries = activeInjuryLocations(user)

  return all.filter(ex => {
    if (equipmentSet && !ex.equipment.every(e => equipmentSet.has(e))) return false
    if (injuries.length > 0 && ex.injuryContraindications.some(c => injuries.includes(c))) return false
    return true
  })
}

async function buildPromptContext(user: User, goalText: string, weeksCount: number): Promise<{ system: string; userMsg: string; allowed: Exercise[] }> {
  const allowed = await allowedExercises(user)
  const unit = user.preferences.weightUnit

  // Current strength picture — the live e1RM records.
  const summaries = await getExerciseRecordSummaries(user.id)
  const nameById = new Map(allowed.map(e => [e.id, e.name]))
  const e1rmLines = summaries
    .filter(s => nameById.has(s.exerciseId))
    .slice(0, 20)
    .map(s => `- ${s.exerciseId} (${nameById.get(s.exerciseId)}): ${s.allTimePR.estimated1RM} ${unit} e1RM (best ${s.allTimePR.weight}×${s.allTimePR.reps})`)

  // Recent training volume.
  const monthAgo = new Date()
  monthAgo.setDate(monthAgo.getDate() - 28)
  const recentCompleted = await db.workouts
    .where('userId').equals(user.id)
    .filter(w => w.status === 'completed' && w.completedAt != null && new Date(w.completedAt) >= monthAgo)
    .count()

  // Recovery trend from daily check-ins.
  const checkIns = await getRecentCheckIns(user.id, 7)
  const avg = (k: 'sleepQuality' | 'soreness' | 'stress' | 'energy') =>
    checkIns.length ? (checkIns.reduce((a, c) => a + c[k], 0) / checkIns.length).toFixed(1) : 'n/a'

  const injuries = activeInjuryLocations(user)
  const p = user.preferences
  const f = user.fitnessProfile

  const exerciseList = allowed
    .filter(ex => ex.category !== 'mobility')
    .map(ex => `${ex.id} | ${ex.name} | ${ex.movementPattern}`)
    .join('\n')

  const system = [
    'You are a pragmatic, evidence-based strength coach designing a training program for one athlete inside their workout app.',
    'Hard rules:',
    '- Use ONLY exerciseIds from the allowed exercise list. Never invent ids.',
    `- Design exactly ${weeksCount} weeks (weeksCount=${weeksCount}) with one entry per week in weeklyProgression.`,
    `- Design ${p.trainingDaysPerWeek} training days per week (the "days" array), sized to roughly ${p.sessionDurationMinutes}-minute sessions.`,
    '- Give percent1RM on main compound lifts the athlete has an e1RM for; use targetRPE for accessories.',
    '- Use supersetGroup only for sensible non-competing pairings.',
    '- Respect listed injuries: avoid aggravating patterns and say so in the summary.',
    '- Include a deload week (isDeload, intensityMultiplier ~0.8) if the program is 5+ weeks.',
    'Call the create_program tool with the finished program.',
  ].join('\n')

  const userMsg = [
    `## Athlete`,
    `- Experience: ${p.experienceLevel} (${f.yearsTraining} yrs training, background: ${f.trainingBackground})`,
    `- Primary goal setting: ${p.primaryGoal}; motivation: ${f.primaryMotivation}`,
    `- Days/week: ${p.trainingDaysPerWeek}; session length: ${p.sessionDurationMinutes} min; equipment: ${p.equipmentAccess}`,
    `- Weight unit: ${unit}`,
    injuries.length ? `- ACTIVE INJURIES: ${injuries.join(', ')}` : '- No active injuries',
    f.targetAreas.length ? `- Focus areas: ${f.targetAreas.join(', ')}` : '',
    ``,
    `## Goals (athlete's own words)`,
    goalText.trim() || '(none given — use the profile above)',
    ``,
    `## Current strength (estimated 1RMs)`,
    e1rmLines.length ? e1rmLines.join('\n') : '(no logged records yet — lean on targetRPE instead of percent1RM)',
    ``,
    `## Recent training`,
    `- ${recentCompleted} completed sessions in the last 28 days`,
    `- 7-day averages: sleep quality ${avg('sleepQuality')}/10, soreness ${avg('soreness')}/10, stress ${avg('stress')}/10, energy ${avg('energy')}/10`,
    ``,
    `## Allowed exercises (id | name | movement pattern)`,
    exerciseList,
  ].filter(Boolean).join('\n')

  return { system, userMsg, allowed }
}

// ----------------------------------------------------------------------------
// Validation & exercise resolution
// ----------------------------------------------------------------------------

function validateGeneratedProgram(input: unknown, weeksCount: number): { value: GeneratedProgram | null; errors: string[] } {
  const errors: string[] = []
  const o = input as Partial<GeneratedProgram> | null
  if (!o || typeof o !== 'object') return { value: null, errors: ['output is not an object'] }

  if (typeof o.name !== 'string' || !o.name.trim()) errors.push('name missing')
  if (typeof o.summary !== 'string') errors.push('summary missing')
  if (!Array.isArray(o.days) || o.days.length < 2 || o.days.length > 6) errors.push('days must be an array of 2-6 day templates')
  if (!Array.isArray(o.weeklyProgression)) errors.push('weeklyProgression missing')

  const days = (o.days ?? []).map((d, di) => {
    if (typeof d?.name !== 'string' || !Array.isArray(d?.exercises)) {
      errors.push(`day ${di + 1} malformed`)
      return { name: `Day ${di + 1}`, exercises: [] }
    }
    const exercises: GeneratedProgramExercise[] = d.exercises
      .map((e, ei) => {
        if (typeof e?.exerciseId !== 'string' || typeof e?.sets !== 'number' || typeof e?.reps !== 'number') {
          errors.push(`day ${di + 1} exercise ${ei + 1} missing exerciseId/sets/reps`)
          return null
        }
        return {
          exerciseId: e.exerciseId,
          sets: Math.min(Math.max(Math.round(e.sets), 1), 6),
          reps: Math.min(Math.max(Math.round(e.reps), 1), 30),
          percent1RM: typeof e.percent1RM === 'number' ? Math.min(Math.max(e.percent1RM, 30), 95) : null,
          targetRPE: typeof e.targetRPE === 'number' ? Math.min(Math.max(e.targetRPE, 5), 10) : null,
          supersetGroup: typeof e.supersetGroup === 'number' ? e.supersetGroup : null,
          note: typeof e.note === 'string' ? e.note : '',
        }
      })
      .filter((e): e is GeneratedProgramExercise => e !== null)
    if (exercises.length < 1) errors.push(`day ${di + 1} has no valid exercises`)
    return { name: d.name, exercises }
  })

  // Normalize progression: one entry per week 1..weeksCount, defaults filled in.
  const progressionByWeek = new Map<number, { intensityMultiplier: number; repDelta: number; isDeload: boolean }>()
  for (const w of o.weeklyProgression ?? []) {
    if (typeof w?.week !== 'number' || typeof w?.intensityMultiplier !== 'number') continue
    progressionByWeek.set(Math.round(w.week), {
      intensityMultiplier: Math.min(Math.max(w.intensityMultiplier, 0.5), 1.15),
      repDelta: typeof w.repDelta === 'number' ? Math.min(Math.max(Math.round(w.repDelta), -4), 4) : 0,
      isDeload: w.isDeload === true,
    })
  }
  const weeklyProgression = Array.from({ length: weeksCount }, (_, i) => ({
    week: i + 1,
    ...(progressionByWeek.get(i + 1) ?? { intensityMultiplier: 1, repDelta: 0, isDeload: false }),
  }))

  if (errors.length > 0) return { value: null, errors }
  return {
    value: {
      name: (o.name as string).trim(),
      summary: o.summary as string,
      weeksCount,
      days,
      weeklyProgression,
    },
    errors: [],
  }
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Map each generated exerciseId onto a real exercise the user can do:
 * exact id → normalized name/id match → token overlap → listed substitute.
 * Unresolvable exercises are dropped with a warning. Never invents ids.
 */
export function resolvePlanExercises(
  plan: GeneratedProgram,
  allowed: Exercise[]
): { plan: GeneratedProgram; warnings: string[] } {
  const warnings: string[] = []
  const byId = new Map(allowed.map(e => [e.id, e]))
  const byNorm = new Map<string, Exercise>()
  for (const e of allowed) {
    byNorm.set(normalizeName(e.id), e)
    byNorm.set(normalizeName(e.name), e)
  }

  const resolveOne = (rawId: string): Exercise | null => {
    if (byId.has(rawId)) return byId.get(rawId)!
    const norm = normalizeName(rawId)
    if (byNorm.has(norm)) return byNorm.get(norm)!
    // Token overlap: best allowed exercise sharing the most name tokens.
    const tokens = rawId.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2)
    let best: Exercise | null = null
    let bestScore = 0
    for (const e of allowed) {
      const target = `${e.id} ${e.name}`.toLowerCase()
      const score = tokens.filter(t => target.includes(t)).length
      if (score > bestScore) { best = e; bestScore = score }
    }
    if (best && bestScore >= Math.max(2, tokens.length - 1)) return best
    // Substitute of a known-but-filtered library exercise.
    const libMatch = EXERCISE_LIBRARY.find(e => e.id === rawId || normalizeName(e.name) === norm)
    if (libMatch) {
      for (const subId of libMatch.substitutes) {
        if (byId.has(subId)) return byId.get(subId)!
      }
    }
    return null
  }

  const days = plan.days.map(day => {
    const exercises = day.exercises
      .map(ex => {
        const match = resolveOne(ex.exerciseId)
        if (!match) {
          warnings.push(`Dropped "${ex.exerciseId}" (${day.name}) — no matching exercise available to you`)
          return null
        }
        if (match.id !== ex.exerciseId) {
          warnings.push(`Mapped "${ex.exerciseId}" → ${match.name} (${day.name})`)
        }
        return { ...ex, exerciseId: match.id }
      })
      .filter((e): e is GeneratedProgramExercise => e !== null)
    return { ...day, exercises }
  })

  return { plan: { ...plan, days }, warnings }
}

// ----------------------------------------------------------------------------
// Claude call
// ----------------------------------------------------------------------------

interface AnthropicResponse {
  content?: { type: string; input?: unknown }[]
  error?: { type?: string; message?: string }
}

async function callClaude(apiKey: string, system: string, userMsg: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
  let resp: Response
  try {
    resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        system,
        messages: [{ role: 'user', content: userMsg }],
        tools: [CREATE_PROGRAM_TOOL],
        tool_choice: { type: 'tool', name: 'create_program' },
      }),
      signal: controller.signal,
    })
  } catch (err) {
    throw new ProgramGenerationError(
      'network',
      err instanceof DOMException && err.name === 'AbortError'
        ? 'The request timed out. Check your connection and try again.'
        : 'Could not reach Claude. Check your connection and try again.'
    )
  } finally {
    clearTimeout(timer)
  }

  const json = (await resp.json().catch(() => null)) as AnthropicResponse | null
  if (!resp.ok) {
    const msg = json?.error?.message ?? `API error (${resp.status})`
    throw new ProgramGenerationError(
      'api_error',
      resp.status === 401 ? 'Your API key was rejected — check it in Settings.' : msg
    )
  }

  const toolUse = json?.content?.find(b => b.type === 'tool_use')
  if (!toolUse?.input) {
    throw new ProgramGenerationError('invalid_output', 'Claude returned no program. Try again.')
  }
  return toolUse.input
}

/**
 * Generate a program plan (not yet persisted): builds the prompt from the
 * user's profile + live e1RMs + recent training, calls Claude with a forced
 * tool call, validates, and resolves exercises. One retry with the validation
 * errors appended; then throws ProgramGenerationError.
 */
export async function generateProgramPlan(
  user: User,
  goalText: string,
  weeksCount: number
): Promise<GenerationResult> {
  if (!user.apiKey) {
    throw new ProgramGenerationError('no_api_key', 'Add your Claude API key in Settings → AI Coaching first.')
  }

  const { system, userMsg, allowed } = await buildPromptContext(user, goalText, weeksCount)

  let raw = await callClaude(user.apiKey, system, userMsg)
  let { value, errors } = validateGeneratedProgram(raw, weeksCount)

  if (!value) {
    // One retry, telling the model exactly what was wrong.
    raw = await callClaude(
      user.apiKey,
      system,
      `${userMsg}\n\n## IMPORTANT — your previous attempt was invalid:\n${errors.map(e => `- ${e}`).join('\n')}\nFix these and call create_program again.`
    )
    ;({ value, errors } = validateGeneratedProgram(raw, weeksCount))
  }
  if (!value) {
    throw new ProgramGenerationError('invalid_output', `Claude's program didn't validate: ${errors.join('; ')}`)
  }

  const resolved = resolvePlanExercises(value, allowed)
  if (resolved.plan.days.every(d => d.exercises.length === 0)) {
    throw new ProgramGenerationError('invalid_output', 'No exercises in the generated program matched your library.')
  }

  return { plan: resolved.plan, warnings: resolved.warnings, model: CLAUDE_MODEL }
}

// ----------------------------------------------------------------------------
// Materialization — expand the plan into concrete planned workouts
// ----------------------------------------------------------------------------

/** Chronological training dates: weeks × daysPerWeek, on the user's preferred weekdays. */
function scheduleDates(startDate: Date, weeks: number, daysPerWeek: number, preferredDays: number[]): Date[][] {
  let chosen = [...new Set(preferredDays)].filter(d => d >= 0 && d <= 6).sort((a, b) => a - b)
  const fallbackOrder = [1, 3, 5, 2, 4, 6, 0]
  for (const d of fallbackOrder) {
    if (chosen.length >= daysPerWeek) break
    if (!chosen.includes(d)) chosen.push(d)
  }
  chosen = chosen.slice(0, daysPerWeek).sort((a, b) => a - b)
  const chosenSet = new Set(chosen)

  const result: Date[][] = []
  const cursor = new Date(startDate)
  cursor.setHours(9, 0, 0, 0)
  for (let w = 0; w < weeks; w++) {
    const week: Date[] = []
    while (week.length < daysPerWeek) {
      if (chosenSet.has(cursor.getDay())) week.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    result.push(week)
  }
  return result
}

/**
 * Persist an accepted plan: archives any existing active program (deleting its
 * not-yet-started planned workouts, keeping completed history), then creates
 * the Program row and every concrete workout (status 'planned', weekId null,
 * programId set) with blocks, instances, supersets, and computed set targets.
 * Weights come from e1RM × %1RM × week multiplier; null targets fall through
 * to the readiness-aware prefill at session start.
 */
export async function materializeProgram(
  userId: string,
  gen: GenerationResult,
  goalText: string,
  startDate: Date
): Promise<string> {
  const user = await db.users.get(userId)
  const unit = user?.preferences.weightUnit ?? 'lbs'
  const preferredDays = user?.preferences.preferredDays ?? []

  const summaries = await getExerciseRecordSummaries(userId)
  const e1rmById = new Map(summaries.map(s => [s.exerciseId, s.allTimePR.estimated1RM]))

  const { plan } = gen
  const daysPerWeek = plan.days.length
  const dates = scheduleDates(startDate, plan.weeksCount, daysPerWeek, preferredDays)
  const progressionByWeek = new Map(plan.weeklyProgression.map(w => [w.week, w]))

  const programId = crypto.randomUUID()
  const now = new Date()

  // Superset instance ids collected during the transaction, linked after it
  // (addExerciseToSuperset opens its own transaction).
  const supersetGroups: string[][] = []

  await db.transaction(
    'rw',
    [db.programs, db.workouts, db.workoutBlocks, db.exerciseInstances, db.setInstances],
    async () => {
      // Archive the previous active program and clear its untouched workouts.
      const existing = await db.programs.where('userId').equals(userId).toArray()
      for (const old of existing.filter(prog => prog.status === 'active')) {
        await db.programs.update(old.id, { status: 'archived' })
        const stale = await db.workouts
          .where('programId').equals(old.id)
          .filter(w => w.status === 'planned' || w.status === 'draft')
          .toArray()
        for (const w of stale) {
          const blocks = await db.workoutBlocks.where('workoutId').equals(w.id).toArray()
          const blockIds = blocks.map(b => b.id)
          const instances = blockIds.length
            ? await db.exerciseInstances.where('blockId').anyOf(blockIds).toArray()
            : []
          const instanceIds = instances.map(i => i.id)
          if (instanceIds.length) {
            const setIds = await db.setInstances.where('exerciseInstanceId').anyOf(instanceIds).primaryKeys()
            await db.setInstances.bulkDelete(setIds as string[])
          }
          await db.exerciseInstances.bulkDelete(instanceIds)
          await db.workoutBlocks.bulkDelete(blockIds)
          await db.workouts.delete(w.id)
        }
      }

      const program: Program = {
        id: programId,
        userId,
        name: plan.name,
        summary: plan.summary,
        goalText,
        weeksCount: plan.weeksCount,
        daysPerWeek,
        startDate,
        status: 'active',
        createdAt: now,
        model: gen.model,
        plan,
        warnings: gen.warnings,
      }
      await db.programs.add(program)

      for (let w = 0; w < plan.weeksCount; w++) {
        const prog = progressionByWeek.get(w + 1) ?? { week: w + 1, intensityMultiplier: 1, repDelta: 0, isDeload: false }
        for (let d = 0; d < plan.days.length; d++) {
          const day = plan.days[d]
          if (day.exercises.length === 0) continue
          const scheduledDate = dates[w][d]

          const workout: Workout = {
            id: crypto.randomUUID(),
            userId,
            weekId: null,
            programId,
            programWeek: w + 1,
            programDay: d + 1,
            workoutType: 'programmed',
            dayOfWeek: scheduledDate.getDay(),
            scheduledDate,
            completedAt: null,
            status: 'planned',
            lastEditedAt: now,
            name: prog.isDeload ? `${day.name} · Wk ${w + 1} (deload)` : `${day.name} · Wk ${w + 1}`,
            totalDuration: 0,
            coachingNotes: [],
            skipReason: null,
          }
          await db.workouts.add(workout)

          const blockId = crypto.randomUUID()
          await db.workoutBlocks.add({
            id: blockId,
            workoutId: workout.id,
            type: 'primary',
            order: 0,
            timeTarget: user?.preferences.sessionDurationMinutes ?? 60,
            intent: prog.isDeload ? 'Deload — keep it crisp and easy' : '',
            completed: false,
          })

          const groupInstanceIds = new Map<number, string[]>()
          for (let i = 0; i < day.exercises.length; i++) {
            const ex = day.exercises[i]
            const instId = crypto.randomUUID()
            await db.exerciseInstances.add({
              id: instId,
              blockId,
              exerciseId: ex.exerciseId,
              order: i,
              notes: ex.note ?? '',
              substituteFor: null,
              substitutionReason: null,
              supersetGroupId: null,
            })
            if (ex.supersetGroup != null) {
              const list = groupInstanceIds.get(ex.supersetGroup) ?? []
              list.push(instId)
              groupInstanceIds.set(ex.supersetGroup, list)
            }

            const e1rm = e1rmById.get(ex.exerciseId)
            const targetWeight =
              e1rm != null && ex.percent1RM != null
                ? roundToIncrement(e1rm * (ex.percent1RM / 100) * prog.intensityMultiplier, unit)
                : null
            const targetReps = Math.min(Math.max(ex.reps + prog.repDelta, 1), 30)

            const setRows: SetInstance[] = Array.from({ length: ex.sets }, (_, si) => ({
              id: crypto.randomUUID(),
              exerciseInstanceId: instId,
              setNumber: si + 1,
              setType: 'working' as const,
              targetReps,
              targetWeight,
              targetRPE: ex.targetRPE,
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
            await db.setInstances.bulkAdd(setRows)
          }

          for (const members of groupInstanceIds.values()) {
            if (members.length >= 2) supersetGroups.push(members)
          }
        }
      }
    }
  )

  // Link supersets outside the main transaction.
  for (const members of supersetGroups) {
    let groupId: string | null = null
    for (const instId of members) {
      groupId = await addExerciseToSuperset(instId, groupId)
    }
  }

  return programId
}

/** Default program start: today (local). */
export function defaultStartDate(): Date {
  const d = new Date(getLocalDateString() + 'T09:00:00')
  return d
}
