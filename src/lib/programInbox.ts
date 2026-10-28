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
 *     "revision": 3,                          // bumped by Cato's weekly adaptation; same id = same block
 *     "changelog": ["Wk 2 bench 165 -> 170 (RPE 6.3)"],   // what the latest revision changed, for the card
 *     "plan": { name, summary, days[], weekDays[][], weeklyProgression[] }
 *   }
 *
 * A higher revision of an installed id is an UPDATE: the remaining planned workouts are
 * rebuilt from the new plan (with its targetWeights) and everything already done is kept.
 */
import { getCurrentUser } from '@/db'
import type { User } from '@/lib/types'
import { getCatoSyncConfig, saveCatoSyncConfig, readRepoFile } from './catoSync'
import { db } from '@/db'
import { getLocalDateString } from '@/lib/utils'
import {
  validateGeneratedProgram,
  allowedExercises,
  resolvePlanExercises,
  materializeProgram,
  rematerializeProgram,
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
  /** Revision counter, 1 when absent. Same id with a higher revision = update the installed block. */
  revision: number
  /** What the latest revision changed, one line each; shown on the update card. */
  changelog: string[]
  plan: unknown
}

export interface InboxState {
  /** Sync is off or has no token — nothing to read. */
  configured: boolean
  program: InboxProgram | null
  /** True when this program id was already installed on this device. */
  installed: boolean
  /** True when the installed id is back with a higher revision. */
  updateAvailable: boolean
  /** The revision applied on this device, when installed. */
  installedRevision: number | null
  error: string | null
}

export async function fetchInboxProgram(): Promise<InboxState> {
  const cfg = await getCatoSyncConfig()
  const empty = { program: null, installed: false, updateAvailable: false, installedRevision: null }
  if (!cfg.enabled || !cfg.token) return { configured: false, ...empty, error: null }
  try {
    const text = await readRepoFile(cfg, PROGRAM_INBOX_PATH)
    if (text == null) return { configured: true, ...empty, error: null }
    const j = JSON.parse(text) as Partial<InboxProgram>
    if (!j || typeof j.id !== 'string' || typeof j.weeksCount !== 'number' || !j.plan) {
      return { configured: true, ...empty, error: 'The program file in the repo is malformed.' }
    }
    const program: InboxProgram = {
      schema: typeof j.schema === 'number' ? j.schema : 1,
      id: j.id,
      source: typeof j.source === 'string' ? j.source : 'Cato',
      createdAt: typeof j.createdAt === 'string' ? j.createdAt : '',
      goalText: typeof j.goalText === 'string' ? j.goalText : '',
      weeksCount: Math.min(Math.max(Math.round(j.weeksCount), 1), 16),
      startDate: typeof j.startDate === 'string' ? j.startDate : '',
      revision: typeof j.revision === 'number' && j.revision >= 1 ? Math.round(j.revision) : 1,
      changelog: Array.isArray(j.changelog) ? j.changelog.filter((x): x is string => typeof x === 'string').slice(0, 12) : [],
      plan: j.plan,
    }
    const installed = cfg.installedProgramId === program.id
    const installedRevision = installed ? (cfg.installedProgramRevision ?? 1) : null
    const updateAvailable = installed && program.revision > (installedRevision ?? 1)
    return { configured: true, program, installed, updateAvailable, installedRevision, error: null }
  } catch (e) {
    return { configured: true, ...empty, error: e instanceof Error ? e.message : 'Could not read the program from GitHub.' }
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
  const programId = await materializeProgram(user.id, gen, program.goalText, start, { inboxId: program.id, inboxRevision: program.revision })
  await saveCatoSyncConfig({ installedProgramId: program.id, installedProgramRevision: program.revision })
  return { programId, warnings: gen.warnings }
}

/**
 * Update: the installed block came back with a higher revision. Planned workouts from today
 * on are rebuilt from the new plan (new loads, swapped movements); completed and in-progress
 * sessions, and anything dated before today, stay exactly as they are.
 */
export async function updateInstalledProgram(program: InboxProgram): Promise<{ programId: string; rebuilt: number; kept: number; warnings: string[] }> {
  const user = await getCurrentUser()
  if (!user) throw new Error('No user profile on this device.')
  const programs = await db.programs.where('userId').equals(user.id).toArray()
  const active = programs.filter(p => p.status === 'active')
  // Blocks installed before revisions existed carry no inboxId; match them by plan name.
  const planName = (program.plan as { name?: unknown } | null)?.name
  const target = active.find(p => p.inboxId === program.id) ?? active.find(p => typeof planName === 'string' && p.name === planName)
  if (!target) throw new Error('The installed block was not found on this device. Install it instead.')
  const gen = await previewInboxProgram(user, program)
  const from = new Date(getLocalDateString() + 'T00:00:00')
  const { rebuilt, kept } = await rematerializeProgram(user.id, target.id, gen, from, { inboxId: program.id, inboxRevision: program.revision })
  await saveCatoSyncConfig({ installedProgramId: program.id, installedProgramRevision: program.revision })
  return { programId: target.id, rebuilt, kept, warnings: gen.warnings }
}
