/**
 * Program inbox — the reverse direction of Cato sync.
 *
 * Cato (Eric's life agent) writes a training block to the LifeOS repo at
 * `data/body/program/active.json`. FORGE reads it with the same GitHub token
 * the sync already holds, validates it with the Coach's own validator, maps
 * every exerciseId onto the library, and materializes it into scheduled
 * workouts — so a block designed in Obsidian lands on the phone with one tap.
 *
 * The file shape mirrors the Coach's GeneratedProgram plus a little metadata:
 *
 *   {
 *     "schema": 1,
 *     "id": "winterfell-2-2026-10-20",      // unique per block; installed once
 *     "source": "Cato",
 *     "createdAt": "2026-10-18T22:00:00Z",
 *     "goalText": "...",                     // stored on the Program row
 *     "weeksCount": 4,
 *     "startDate": "2026-10-20",             // local date, first training day on/after it
 *     "plan": { name, summary, days[], weeklyProgression[] }
 *   }
 */
import { getCurrentUser } from '@/db'
import type { User } from '@/lib/types'
import { getCatoSyncConfig, saveCatoSyncConfig, readRepoFile } from './catoSync'
import {
  validateGeneratedProgram,
  allowedExercises,
  resolvePlanExercises,
  materializeProgram,
  type GenerationResult,
} from './programGeneration'

export const PROGRAM_INBOX_PATH = 'data/body/program/active.json'

export interface InboxProgram {
  schema: number
  id: string
  source: string
  createdAt: string
  goalText: string
  weeksCount: number
  startDate: string
  plan: unknown
}

export interface InboxState {
  /** Sync is off or has no token — nothing to read. */
  configured: boolean
  program: InboxProgram | null
  /** True when this program id was already installed on this device. */
  installed: boolean
  error: string | null
}

export async function fetchInboxProgram(): Promise<InboxState> {
  const cfg = await getCatoSyncConfig()
  if (!cfg.enabled || !cfg.token) return { configured: false, program: null, installed: false, error: null }
  try {
    const text = await readRepoFile(cfg, PROGRAM_INBOX_PATH)
    if (text == null) return { configured: true, program: null, installed: false, error: null }
    const j = JSON.parse(text) as Partial<InboxProgram>
    if (!j || typeof j.id !== 'string' || typeof j.weeksCount !== 'number' || !j.plan) {
      return { configured: true, program: null, installed: false, error: 'The program file in the repo is malformed.' }
    }
    const program: InboxProgram = {
      schema: typeof j.schema === 'number' ? j.schema : 1,
      id: j.id,
      source: typeof j.source === 'string' ? j.source : 'Cato',
      createdAt: typeof j.createdAt === 'string' ? j.createdAt : '',
      goalText: typeof j.goalText === 'string' ? j.goalText : '',
      weeksCount: Math.min(Math.max(Math.round(j.weeksCount), 1), 16),
      startDate: typeof j.startDate === 'string' ? j.startDate : '',
      plan: j.plan,
    }
    return { configured: true, program, installed: cfg.installedProgramId === program.id, error: null }
  } catch (e) {
    return { configured: true, program: null, installed: false, error: e instanceof Error ? e.message : 'Could not read the program from GitHub.' }
  }
}

/** Validate + resolve without persisting, so the Coach can preview it. */
export async function previewInboxProgram(user: User, program: InboxProgram): Promise<GenerationResult> {
  const { value, errors } = validateGeneratedProgram(program.plan, program.weeksCount)
  if (!value) throw new Error(`Program did not validate: ${errors.join('; ')}`)
  const allowed = await allowedExercises(user)
  const resolved = resolvePlanExercises(value, allowed)
  if (resolved.plan.days.every(d => d.exercises.length === 0)) throw new Error('No exercises in the program matched your library.')
  return { plan: resolved.plan, warnings: resolved.warnings, model: program.source }
}

/** Install: archive the current program, schedule every workout, remember the id. */
export async function installInboxProgram(program: InboxProgram, startDateOverride?: string): Promise<{ programId: string; warnings: string[] }> {
  const user = await getCurrentUser()
  if (!user) throw new Error('No user profile on this device.')
  const gen = await previewInboxProgram(user, program)
  const startStr = startDateOverride || program.startDate
  const start = startStr ? new Date(startStr + 'T09:00:00') : new Date()
  const programId = await materializeProgram(user.id, gen, program.goalText, start)
  await saveCatoSyncConfig({ installedProgramId: program.id })
  return { programId, warnings: gen.warnings }
}
