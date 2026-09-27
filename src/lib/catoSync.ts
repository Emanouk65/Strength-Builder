/**
 * Cato sync — pushes a daily training summary from FORGE into Eric's LifeOS repo
 * (GitHub, `data/body/forge/<YYYY-MM-DD>.json`) so Cato, his life agent, reads
 * real sessions, sets, estimated 1RMs and check-ins instead of asking for them.
 *
 * Zero taps after setup: finishing a workout or saving a check-in queues a sync
 * for that day; the queue retries on the next app open if the phone was offline.
 * A file is only committed when its content changed.
 *
 * The GitHub token is a fine-grained token limited to the LifeOS repo
 * (Contents: read and write). It lives in local app settings, never in backups.
 */
import { db, getAppSettings, updateAppSettings, getWorkoutWithDetails, resolveExercises } from '@/db'
import { getLocalDateString } from '@/lib/utils'
import type { CatoSyncConfig } from '@/lib/types'

export const CATO_SYNC_DEFAULTS: CatoSyncConfig = {
  enabled: false,
  token: '',
  repo: 'Emanouk65/LifeOS',
  branch: 'main',
  path: 'data/body/forge',
  pending: [],
  lastSyncedAt: null,
  lastSyncedDate: null,
  lastError: null,
}

export async function getCatoSyncConfig(): Promise<CatoSyncConfig> {
  const s = await getAppSettings()
  return { ...CATO_SYNC_DEFAULTS, ...(s.catoSync ?? {}) }
}

export async function saveCatoSyncConfig(patch: Partial<CatoSyncConfig>): Promise<CatoSyncConfig> {
  const next = { ...(await getCatoSyncConfig()), ...patch }
  await updateAppSettings({ catoSync: next })
  return next
}

// ----------------------------------------------------------------------------
// Payload
// ----------------------------------------------------------------------------

const e1rm = (w: number, r: number) => (r <= 1 ? w : Math.round(w * (1 + r / 30))) // Epley

function dayBounds(date: string): [Date, Date] {
  const [y, m, d] = date.split('-').map(Number)
  return [new Date(y, m - 1, d, 0, 0, 0, 0), new Date(y, m - 1, d + 1, 0, 0, 0, 0)]
}

export interface ForgeDayPayload {
  date: string
  source: 'FORGE'
  schema: 1
  workouts: Array<{
    id: string
    name: string
    type: string
    status: string
    completedAt: string | null
    durationMin: number | null
    program: { id: string | null; week: number | null; day: number | null } | null
    setsCompleted: number
    volume: number
    topSet: string | null
    exercises: Array<{ name: string; sets: Array<{ weight: number | null; reps: number | null; rpe: number | null; type: string }> }>
    cardio: { type: string; distance: number | null; unit: string; durationSec: number; avgHr: number | null } | null
  }>
  liftRecords: Array<{ exercise: string; e1rm: number; bestSet: string; date: string; isPR: boolean }>
  checkIn: Record<string, number | string | null> | null
}

export async function buildForgeDay(date: string): Promise<ForgeDayPayload> {
  const [start, end] = dayBounds(date)
  const workouts = (await db.workouts.toArray()).filter(
    (w) => w.completedAt && new Date(w.completedAt) >= start && new Date(w.completedAt) < end && w.status === 'completed'
  )

  const out: ForgeDayPayload['workouts'] = []
  for (const w of workouts.sort((a, b) => +new Date(a.completedAt!) - +new Date(b.completedAt!))) {
    const d = await getWorkoutWithDetails(w.id)
    if (!d) continue
    let setsCompleted = 0
    let volume = 0
    let top: { name: string; weight: number; reps: number } | null = null
    const exercises: ForgeDayPayload['workouts'][number]['exercises'] = []
    for (const block of d.blocks) {
      if (block.type === 'warmup' || block.type === 'cooldown') continue
      for (const ex of block.exercises) {
        const name = ex.exercise?.name ?? 'Exercise'
        const done = ex.sets.filter((s) => s.completed && !s.skipped)
        if (!done.length) continue
        exercises.push({
          name,
          sets: done.map((s) => ({ weight: s.actualWeight, reps: s.actualReps, rpe: s.actualRPE, type: s.setType })),
        })
        for (const s of done) {
          if (s.setType === 'warmup') continue
          setsCompleted++
          if (s.actualWeight && s.actualReps) {
            volume += s.actualWeight * s.actualReps
            if (!top || s.actualWeight > top.weight || (s.actualWeight === top.weight && s.actualReps > top.reps)) {
              top = { name, weight: s.actualWeight, reps: s.actualReps }
            }
          }
        }
      }
    }
    const cd = d.cardioData
    out.push({
      id: d.id,
      name: d.name,
      type: d.workoutType,
      status: d.status,
      completedAt: d.completedAt ? new Date(d.completedAt).toISOString() : null,
      durationMin: d.totalDuration || null,
      program: d.programId ? { id: d.programId, week: d.programWeek ?? null, day: d.programDay ?? null } : null,
      setsCompleted,
      volume: Math.round(volume),
      topSet: top ? `${top.name} ${top.weight}×${top.reps}` : null,
      exercises,
      cardio: cd ? { type: cd.cardioType, distance: cd.distance, unit: cd.distanceUnit, durationSec: cd.duration, avgHr: cd.avgHeartRate } : null,
    })
  }

  // Best estimated 1RM per exercise across all history, as of the end of this day.
  const records = (await db.liftRecords.toArray()).filter((r) => new Date(r.date) < end)
  const best = new Map<string, (typeof records)[number]>()
  for (const r of records) {
    const cur = best.get(r.exerciseId)
    if (!cur || r.estimated1RM > cur.estimated1RM) best.set(r.exerciseId, r)
  }
  const names = await resolveExercises([...best.keys()])
  const liftRecords = [...best.values()]
    .sort((a, b) => b.estimated1RM - a.estimated1RM)
    .slice(0, 20)
    .map((r) => ({
      exercise: names.get(r.exerciseId)?.name ?? r.exerciseId,
      e1rm: Math.round(r.estimated1RM || e1rm(r.weight, r.reps)),
      bestSet: `${r.weight}×${r.reps}`,
      date: getLocalDateString(new Date(r.date)),
      isPR: Boolean(r.isPersonalRecord) && getLocalDateString(new Date(r.date)) === date,
    }))

  const ci = await db.dailyCheckIns.where('date').equals(date).first()
  const checkIn = ci
    ? {
        energy: ci.energy, mood: ci.mood, sleepQuality: ci.sleepQuality, sleepHours: ci.sleepHours,
        hydration: ci.hydration, nutrition: ci.nutrition, stress: ci.stress, motivation: ci.motivation,
        soreness: ci.soreness, highlight: ci.highlight || null, challenge: ci.challenge || null, notes: ci.notes || null,
      }
    : null

  return { date, source: 'FORGE', schema: 1, workouts: out, liftRecords, checkIn }
}

// ----------------------------------------------------------------------------
// GitHub contents API
// ----------------------------------------------------------------------------

const toBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
const fromBase64 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)))

async function gh(cfg: CatoSyncConfig, path: string, init?: RequestInit) {
  // No trailing slash for the repo itself: GitHub answers 404 to `/repos/owner/name/`.
  const repo = cfg.repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '')
  return fetch(`https://api.github.com/repos/${repo}${path ? '/' + path : ''}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
}

function explain(status: number, fallback: string): string {
  if (status === 401) return 'GitHub rejected the token. Create a new one and paste it again.'
  if (status === 403) return 'The token can’t write to this repo. Give it Contents: read and write on the LifeOS repo.'
  if (status === 404) return 'Repo not found. Check the owner/name, and that the token includes this repo.'
  if (status === 409 || status === 422) return 'GitHub had a conflicting update. It will retry on the next sync.'
  return fallback
}

/** Check the token and repo without writing anything. */
export async function testCatoConnection(cfg: CatoSyncConfig): Promise<string | null> {
  try {
    const r = await gh(cfg, '')
    if (!r.ok) return explain(r.status, `GitHub returned ${r.status}.`)
    const j = await r.json()
    if (j?.permissions && !j.permissions.push) return 'The token can read the repo but not write to it.'
    return null
  } catch {
    return 'No connection to GitHub. Check your network and try again.'
  }
}

/** Write one day's file. Returns 'written', 'unchanged', or 'empty'. */
async function pushDay(cfg: CatoSyncConfig, date: string): Promise<'written' | 'unchanged' | 'empty'> {
  const payload = await buildForgeDay(date)
  const filePath = `${cfg.path}/${date}.json`
  const body = JSON.stringify(payload, null, 2) + '\n'

  const cur = await gh(cfg, `contents/${filePath}?ref=${encodeURIComponent(cfg.branch)}`)
  let sha: string | undefined
  if (cur.ok) {
    const j = await cur.json()
    sha = j.sha
    if (typeof j.content === 'string' && fromBase64(j.content) === body) return 'unchanged'
  } else if (cur.status !== 404) {
    throw new Error(explain(cur.status, `GitHub returned ${cur.status}.`))
  }
  // Nothing trained or checked in, and no file yet: don't create an empty day.
  if (!sha && !payload.workouts.length && !payload.checkIn) return 'empty'

  const put = await gh(cfg, `contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `FORGE: ${date} (${payload.workouts.length} workout${payload.workouts.length === 1 ? '' : 's'}${payload.checkIn ? ', check-in' : ''})`,
      content: toBase64(body),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  })
  if (!put.ok) throw new Error(explain(put.status, `GitHub returned ${put.status}.`))
  return 'written'
}

let running: Promise<void> | null = null

/**
 * Sync the given dates plus anything still pending. Safe to call often: runs
 * one at a time, never throws, records the outcome in settings for the UI.
 */
export async function runCatoSync(dates: string[] = []): Promise<void> {
  if (running) await running.catch(() => {})
  running = (async () => {
    let cfg = await getCatoSyncConfig()
    if (!cfg.enabled || !cfg.token) return
    const queue = [...new Set([...cfg.pending, ...dates])].sort()
    if (!queue.length) return
    const failed: string[] = []
    let lastError: string | null = null
    let lastWritten: string | null = null
    for (const d of queue) {
      try {
        const res = await pushDay(cfg, d)
        if (res === 'written') lastWritten = d
      } catch (e) {
        failed.push(d)
        lastError = e instanceof Error ? e.message : 'Sync failed.'
        if (!navigator.onLine) { failed.push(...queue.filter((x) => x > d)); break }
      }
    }
    cfg = await saveCatoSyncConfig({
      pending: [...new Set(failed)].slice(-60),
      lastError,
      ...(failed.length === 0 ? { lastSyncedAt: new Date().toISOString() } : {}),
      ...(lastWritten ? { lastSyncedDate: lastWritten } : {}),
    })
  })()
  try { await running } finally { running = null }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Queue a sync for a day (default today). Calls within a few seconds coalesce,
 * so a check-in saved right after finishing a workout makes one commit.
 * Fire-and-forget: never blocks or breaks the caller.
 */
export function requestCatoSync(date: string = getLocalDateString()): void {
  const t = timers.get(date)
  if (t) clearTimeout(t)
  timers.set(date, setTimeout(() => {
    timers.delete(date)
    void (async () => {
      const cfg = await getCatoSyncConfig()
      if (!cfg.enabled || !cfg.token) return
      await saveCatoSyncConfig({ pending: [...new Set([...cfg.pending, date])] })
      await runCatoSync([date])
    })().catch((e) => console.warn('Cato sync failed', e))
  }, 4000))
}

/** On app open: retry anything pending and refresh today and yesterday. */
export function flushCatoSyncOnOpen(): void {
  const today = new Date()
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  void runCatoSync([getLocalDateString(y), getLocalDateString(today)]).catch((e) => console.warn('Cato sync failed', e))
}

/** Settings button: sync every day in the last `days` days. */
export async function backfillCatoSync(days = 30): Promise<void> {
  const today = new Date()
  const list: string[] = []
  for (let i = days - 1; i >= 0; i--) list.push(getLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)))
  await runCatoSync(list)
}
