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
  lastResult: null,
  verifiedAt: null,
  lastHeartbeatAt: null,
  tokenSavedAt: null,
  installedProgramId: null,
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

/** Read one text file from the repo at the sync branch. Null when it does not exist. */
export async function readRepoFile(cfg: CatoSyncConfig, filePath: string): Promise<string | null> {
  const r = await gh(cfg, `contents/${filePath}?ref=${encodeURIComponent(cfg.branch)}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(explain(r.status, `GitHub returned ${r.status}.`))
  const j = await r.json()
  return typeof j.content === 'string' ? fromBase64(j.content) : null
}

/** Check the token and repo without writing anything. */
export async function testCatoConnection(cfg: CatoSyncConfig): Promise<string | null> {
  try {
    const r = await gh(cfg, '')
    if (!r.ok) return explain(r.status, `GitHub returned ${r.status}.`)
    return null
  } catch {
    return 'No connection to GitHub. Check your network and try again.'
  }
}

/** Create or update one file on the sync branch. `sha` is the current blob when the file exists. */
async function putRepoFile(cfg: CatoSyncConfig, filePath: string, body: string, message: string, sha?: string): Promise<void> {
  const put = await gh(cfg, `contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toBase64(body), branch: cfg.branch, ...(sha ? { sha } : {}) }),
  })
  if (!put.ok) throw new Error(explain(put.status, `GitHub returned ${put.status}.`))
}

/** Current blob sha and content of a file; empty when it does not exist. Throws on any other failure. */
async function repoFile(cfg: CatoSyncConfig, filePath: string): Promise<{ sha?: string; content?: string }> {
  const cur = await gh(cfg, `contents/${filePath}?ref=${encodeURIComponent(cfg.branch)}`)
  if (cur.status === 404) return {}
  if (!cur.ok) throw new Error(explain(cur.status, `GitHub returned ${cur.status}.`))
  const j = await cur.json()
  return { sha: j.sha, content: typeof j.content === 'string' ? fromBase64(j.content) : undefined }
}

/**
 * The heartbeat file, `<path>/_status.json`. Writing it is the only proof the token can
 * write: GitHub's repo metadata reflects the owner's permissions, not the token's, and the
 * browser cannot read the token-expiry header (not CORS-exposed). Connect and "Check now"
 * write it, and the app refreshes it once a day on open, so Cato can tell "token dead" from
 * "no sessions". The leading underscore keeps LifeOS's date-file readers from picking it up.
 */
export const STATUS_FILE = '_status.json'

export type HeartbeatReason = 'connect' | 'check' | 'daily'

type WriteOutcome = { ok: true; file: string } | { ok: false; error: string }

async function putHeartbeat(cfg: CatoSyncConfig, reason: HeartbeatReason): Promise<WriteOutcome> {
  const filePath = `${cfg.path}/${STATUS_FILE}`
  const body =
    JSON.stringify(
      {
        source: 'FORGE',
        schema: 1,
        checkedAt: new Date().toISOString(),
        reason,
        build: __BUILD_NUMBER__,
        commit: __BUILD_COMMIT__,
        tokenSavedAt: cfg.tokenSavedAt,
        lastSyncedAt: cfg.lastSyncedAt,
        lastSyncedDate: cfg.lastSyncedDate,
        pending: cfg.pending.length,
        lastError: cfg.lastError,
      },
      null,
      2
    ) + '\n'
  try {
    const { sha } = await repoFile(cfg, filePath)
    await putRepoFile(cfg, filePath, body, `FORGE: connection check (${reason})`, sha)
    return { ok: true, file: filePath }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not write to GitHub.' }
  }
}

/**
 * Verify a token before it is saved: can it read the repo, and can it write to it? The write
 * is a real commit of the heartbeat file, so a token with the wrong permissions fails here
 * instead of silently failing on every sync afterwards. Saves nothing.
 */
export async function verifyCatoConnection(cfg: CatoSyncConfig): Promise<WriteOutcome> {
  const readErr = await testCatoConnection(cfg)
  if (readErr) return { ok: false, error: readErr }
  return putHeartbeat(cfg, 'connect')
}

/** Write the heartbeat with the saved token and record the outcome in settings. */
export async function writeHeartbeat(reason: HeartbeatReason): Promise<WriteOutcome> {
  const cfg = await getCatoSyncConfig()
  if (!cfg.enabled || !cfg.token) return { ok: false, error: 'Sync is off.' }
  const out = await putHeartbeat(cfg, reason)
  const now = new Date().toISOString()
  if (out.ok) await saveCatoSyncConfig({ lastHeartbeatAt: now, verifiedAt: now, ...(reason !== 'daily' ? { lastError: null } : {}) })
  else await saveCatoSyncConfig({ lastError: out.error })
  return out
}

/** Write one day's file. Returns 'written', 'unchanged', or 'empty'. */
async function pushDay(cfg: CatoSyncConfig, date: string): Promise<'written' | 'unchanged' | 'empty'> {
  const payload = await buildForgeDay(date)
  const filePath = `${cfg.path}/${date}.json`
  const body = JSON.stringify(payload, null, 2) + '\n'

  const { sha, content } = await repoFile(cfg, filePath)
  if (sha && content === body) return 'unchanged'
  // Nothing trained or checked in, and no file yet: don't create an empty day.
  if (!sha && !payload.workouts.length && !payload.checkIn) return 'empty'

  await putRepoFile(
    cfg,
    filePath,
    body,
    `FORGE: ${date} (${payload.workouts.length} workout${payload.workouts.length === 1 ? '' : 's'}${payload.checkIn ? ', check-in' : ''})`,
    sha
  )
  return 'written'
}

/** What one sync run did, for the Settings card and the Connect message. */
export interface SyncReport {
  written: string[]
  unchanged: number
  empty: number
  failed: string[]
  error: string | null
  /** True when the sync is off, so nothing was attempted. */
  skipped: boolean
}

const EMPTY_REPORT: SyncReport = { written: [], unchanged: 0, empty: 0, failed: [], error: null, skipped: true }

export function describeReport(r: SyncReport): string {
  if (r.skipped) return 'Sync is off.'
  const parts: string[] = []
  if (r.written.length) parts.push(`${r.written.length} day${r.written.length === 1 ? '' : 's'} written (latest ${r.written[r.written.length - 1]})`)
  if (r.unchanged) parts.push(`${r.unchanged} already up to date`)
  if (r.empty) parts.push(`${r.empty} with nothing to send`)
  if (r.failed.length) parts.push(`${r.failed.length} failed`)
  const s = parts.join(', ') || 'nothing to do'
  return r.error ? `${s}. ${r.error}` : `${s}.`
}

let running: Promise<SyncReport> | null = null

/**
 * Sync the given dates plus anything still pending. Safe to call often: runs
 * one at a time, never throws, records the outcome in settings for the UI.
 */
export async function runCatoSync(dates: string[] = []): Promise<SyncReport> {
  if (running) await running.catch(() => {})
  running = (async (): Promise<SyncReport> => {
    let cfg = await getCatoSyncConfig()
    if (!cfg.enabled || !cfg.token) return EMPTY_REPORT
    const queue = [...new Set([...cfg.pending, ...dates])].sort()
    if (!queue.length) return { ...EMPTY_REPORT, skipped: false }
    const report: SyncReport = { written: [], unchanged: 0, empty: 0, failed: [], error: null, skipped: false }
    for (const d of queue) {
      try {
        const res = await pushDay(cfg, d)
        if (res === 'written') report.written.push(d)
        else if (res === 'unchanged') report.unchanged++
        else report.empty++
      } catch (e) {
        report.failed.push(d)
        report.error = e instanceof Error ? e.message : 'Sync failed.'
        if (!navigator.onLine) { report.failed.push(...queue.filter((x) => x > d)); break }
      }
    }
    const lastWritten = report.written[report.written.length - 1] ?? null
    const now = new Date()
    const stamp = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    cfg = await saveCatoSyncConfig({
      pending: [...new Set(report.failed)].slice(-60),
      lastError: report.error,
      lastResult: `${stamp}: ${describeReport(report)}`,
      ...(report.failed.length === 0 ? { lastSyncedAt: now.toISOString() } : {}),
      ...(lastWritten ? { lastSyncedDate: lastWritten, verifiedAt: now.toISOString() } : {}),
    })
    return report
  })()
  try { return await running } finally { running = null }
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

const HEARTBEAT_EVERY_MS = 20 * 60 * 60 * 1000

/** At most once a day, on open: refresh the heartbeat so Cato sees the app is alive and the token works. */
async function dailyHeartbeat(): Promise<void> {
  const cfg = await getCatoSyncConfig()
  if (!cfg.enabled || !cfg.token || !navigator.onLine) return
  if (cfg.lastHeartbeatAt && Date.now() - Date.parse(cfg.lastHeartbeatAt) < HEARTBEAT_EVERY_MS) return
  await writeHeartbeat('daily')
}

/** On app open: retry anything pending, refresh today and yesterday, then the daily heartbeat. */
export function flushCatoSyncOnOpen(): void {
  const today = new Date()
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  void runCatoSync([getLocalDateString(y), getLocalDateString(today)])
    .then(() => dailyHeartbeat())
    .catch((e) => console.warn('Cato sync failed', e))
}

/** Settings button: sync every day in the last `days` days. */
export async function backfillCatoSync(days = 30): Promise<SyncReport> {
  const today = new Date()
  const list: string[] = []
  for (let i = days - 1; i >= 0; i--) list.push(getLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)))
  return runCatoSync(list)
}
