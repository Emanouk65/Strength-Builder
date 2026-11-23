import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion, AnimatePresence } from 'framer-motion'
import {
  db,
  getWorkoutWithDetails,
  getCurrentUser,
  updateStreakOnWorkoutComplete,
  checkTimeBasedAchievements,
  checkIronWillAchievement,
  getBestLift,
  getLastExerciseSession,
  getReadiness,
  getAppSettings,
  getExerciseHistory,
  addWarmupSets,
  promoteToInProgress,
  prefillTargetsFromHistory,
  recordWorkoutResults,
  appendSetToExercise,
  syncLiftRecordForSet,
  patchWorkout,
  type ExerciseHistorySession,
} from '@/db'
import { getWarmupDrills, getCooldownStretches, type MobilityDrill } from '@/lib/mobilityContent'
import { readinessDisplay, type ReadinessResult } from '@/lib/readiness'
import { triggerHaptic, playChime } from '@/lib/feedback'
import { requestCatoSync } from '@/lib/catoSync'
import { Button, Sheet } from '@/components/ui'
import { CheckInForm } from '@/components/CheckInForm'
import {
  cn,
  getExerciseInputKind,
  distanceUnitFor,
  secondsToMinutes,
  minutesToSeconds,
  formatSessionSummary,
} from '@/lib/utils'
import { BLOCK_CONFIG, ACHIEVEMENTS } from '@/lib/constants'
import type { BlockType, SetInstance, AchievementId, Exercise, PlanDrill } from '@/lib/types'


export function Workout() {
  const { workoutId } = useParams()
  const navigate = useNavigate()
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [showReflection, setShowReflection] = useState(false)
  const [showCooldown, setShowCooldown] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // Which exercises are currently expanded in the execution view. A set, not a
  // single id, so an entire superset can be open at once. Auto-advances when the
  // active exercise becomes fully complete; user can override by tap.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const workoutData = useLiveQuery(
    async () => { if (!workoutId) return null; return getWorkoutWithDetails(workoutId) },
    [workoutId]
  )

  const user = useLiveQuery(() => getCurrentUser(), [])
  const weightUnit = user?.preferences.weightUnit ?? 'lbs'

  // Local readiness (no API). Re-computes when today's check-in changes.
  const readiness = useLiveQuery(
    async () => (user ? getReadiness(user.id) : null),
    [user]
  )

  const settings = useLiveQuery(() => getAppSettings(), [])

  // Rest timer — a target end-timestamp (ms) plus the total for the ring.
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Called when a set is checked complete: buzz and (optionally) start rest.
  const handleSetCompleted = () => {
    const s = settingsRef.current
    triggerHaptic(s?.hapticFeedback ?? true)
    if (s?.restTimerEnabled ?? true) {
      const total = s?.defaultRestTime ?? 90
      setRest({ endsAt: Date.now() + total * 1000, total })
    }
  }

  // The "active" exercise is the first one with at least one incomplete set.
  // When that changes (because the user just finished all sets in the previous
  // active exercise), we move the expansion to follow. If the active exercise is
  // part of a superset, we expand every member of that group so all its boxes
  // are open together — easier to check off as you alternate between them.
  const lastActiveRef = useRef<string | null>(null)
  useEffect(() => {
    if (!workoutData) return
    const exercises = workoutData.blocks.flatMap(b => b.exercises)
    const active = exercises.find(ex => ex.sets.some(s => !s.completed)) ?? null
    const nextActiveId = active?.id ?? null

    // Only recompute expansion when the active exercise actually changes, so we
    // don't clobber the user's manual open/close toggles on every re-render.
    if (nextActiveId === lastActiveRef.current) return
    lastActiveRef.current = nextActiveId

    if (!active) {
      setExpandedIds(new Set())
      return
    }
    if (active.supersetGroupId) {
      const members = exercises
        .filter(ex => ex.supersetGroupId === active.supersetGroupId)
        .map(ex => ex.id)
      setExpandedIds(new Set(members))
    } else {
      setExpandedIds(new Set([active.id]))
    }
  }, [workoutData])

  // Guard against re-firing the status flip on every live-query re-emit.
  // Without this, the very update below triggers a re-fetch → re-render →
  // another update call, which can race or worse, repeatedly write the same row.
  const promotedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!workoutData) return
    if (workoutData.status === 'completed') return
    if (promotedRef.current === workoutData.id) return
    promotedRef.current = workoutData.id

    // Prefill recommended targets only on the very first start (not on revisits
    // of an already in-progress session, where the user may have adjusted them).
    const isFirstStart = workoutData.status === 'planned' || workoutData.status === 'draft'
    promoteToInProgress(workoutData.id).then(() => {
      if (isFirstStart) prefillTargetsFromHistory(workoutData.id)
    })
  }, [workoutData])

  if (!workoutId) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No workout selected</p>
          <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
        </div>
      </div>
    )
  }

  if (!workoutData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (showCooldown && !showReflection) {
    return (
      <CooldownScreen
        workout={workoutData}
        onContinue={() => {
          setShowCooldown(false)
          setShowReflection(true)
        }}
      />
    )
  }

  if (showReflection && user) {
    return (
      <ReflectionForm
        workoutId={workoutData.id}
        workoutName={workoutData.name}
        userId={user.id}
        onComplete={() => navigate('/', { replace: true })}
      />
    )
  }

  if (workoutData.status === 'completed') {
    return <WorkoutSummary workout={workoutData} onBack={() => navigate('/history')} weightUnit={weightUnit} />
  }

  const currentBlock = workoutData.blocks[currentBlockIndex]

  if (!currentBlock) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">This workout has no exercises configured</p>
          <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
        </div>
      </div>
    )
  }

  const totalBlocks = workoutData.blocks.length
  const completedBlocks = workoutData.blocks.filter(b => b.completed).length
  const progress = (completedBlocks / totalBlocks) * 100

  const totalSetsCompleted = workoutData.blocks.reduce(
    (acc, block) => acc + block.exercises.reduce((s, ex) => s + ex.sets.filter(s => s.completed).length, 0),
    0
  )
  const totalSets = workoutData.blocks.reduce(
    (acc, block) => acc + block.exercises.reduce((s, ex) => s + ex.sets.length, 0),
    0
  )

  const currentBlockSetsCompleted = currentBlock.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter(s => s.completed).length, 0
  )
  const currentBlockTotalSets = currentBlock.exercises.reduce((acc, ex) => acc + ex.sets.length, 0)
  const isCurrentBlockComplete = currentBlockSetsCompleted === currentBlockTotalSets && currentBlockTotalSets > 0

  const handleBlockComplete = async () => {
    await db.workoutBlocks.update(currentBlock.id, { completed: true })
    if (currentBlockIndex < totalBlocks - 1) {
      setCurrentBlockIndex(currentBlockIndex + 1)
    } else {
      // Session done → suggested cooldown stretches, then the full check-in.
      setShowCooldown(true)
    }
  }

  const handleExit = () => setShowExitConfirm(true)

  return (
    <div className="min-h-screen pb-8">
      {/* Exit confirmation overlay */}
      {showExitConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-card border border-border/50 rounded-3xl p-6 shadow-2xl animate-slide-up mb-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-destructive">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-black text-foreground">Leave Workout?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Your progress is saved. Resume anytime.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 font-bold" onClick={() => setShowExitConfirm(false)}>
                Keep Going
              </Button>
              <Button variant="destructive" className="flex-1 font-bold" onClick={() => navigate('/')}>
                Leave
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating header */}
      <div className="sticky top-0 z-20 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2">
        <div className="glass-bar rounded-[28px] px-2 py-2">
          <div className="flex items-center gap-2">
            <HeaderButton label="Exit workout" onClick={handleExit}>
              <path d="M18 6 6 18M6 6l12 12" />
            </HeaderButton>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-tight truncate">{workoutData.name.replace(/\s*[·•-]\s*W(?:ee)?k\s*\d+\s*$/i, '')}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {totalSetsCompleted} of {totalSets} sets
                {totalBlocks > 1 && ` · Block ${currentBlockIndex + 1} of ${totalBlocks}`}
              </p>
            </div>
            <ElapsedClock startedAt={workoutData.startedAt} />
            <HeaderButton label="Edit workout" onClick={() => navigate(`/plan/${workoutData.id}`)}>
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
            </HeaderButton>
          </div>
          <div className="mx-2 mt-2 mb-0.5 h-1 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${Math.max(progress, totalSets > 0 ? (totalSetsCompleted / totalSets) * 100 : 0)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Readiness banner — local, no API. Adjusts prefilled loads. */}
      <ReadinessBanner readiness={readiness} onLogCheckIn={() => navigate('/check-in')} />

      {/* Current Block */}
      <div className="p-4">
        {/* Dynamic warmup — movement prep matched to today's muscles */}
        {currentBlockIndex === 0 && <WarmupSection workout={workoutData} />}

        <div className="mb-4">
          {(totalBlocks > 1 || currentBlock.intent) && (
            <div className="flex items-baseline justify-between px-2 mb-2">
              <p className="eyebrow">
                {currentBlock.intent || BLOCK_CONFIG[currentBlock.type as BlockType]?.label || currentBlock.type}
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {currentBlockSetsCompleted}/{currentBlockTotalSets}
              </span>
            </div>
          )}

          {/* Exercises (with superset visual grouping) */}
          <div>
            {currentBlock.exercises.length > 0 ? (
              <div className="space-y-3">
                {groupExercisesBySuperset(currentBlock.exercises).map((g) => {
                  if (g.kind === 'solo') {
                    return (
                      <ExerciseBlock
                        key={g.instance.id}
                        exerciseInstance={g.instance}
                        userId={workoutData.userId}
                        workoutId={workoutData.id}
                        workoutCompletedAt={workoutData.completedAt}
                        isExpanded={expandedIds.has(g.instance.id)}
                        onToggleExpand={() => toggleExpand(g.instance.id)}
                        onSetCompleted={handleSetCompleted}
                        weightUnit={weightUnit}
                      />
                    )
                  }
                  return (
                    <div key={g.groupId} className="glass rounded-3xl overflow-hidden">
                      <div className="flex items-center gap-2 px-4 pt-3.5 pb-1">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                        <span className="eyebrow">Superset</span>
                      </div>
                      <div className="divide-y divide-white/[0.06]">
                      {g.members.map((m) => (
                        <ExerciseBlock
                          key={m.id}
                          exerciseInstance={m}
                          userId={workoutData.userId}
                          workoutId={workoutData.id}
                          workoutCompletedAt={workoutData.completedAt}
                          isExpanded={expandedIds.has(m.id)}
                          onToggleExpand={() => toggleExpand(m.id)}
                          onSetCompleted={handleSetCompleted}
                          weightUnit={weightUnit}
                          inGroup
                        />
                      ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="glass rounded-3xl py-8 text-center">
                <p className="text-muted-foreground text-sm">No exercises</p>
              </div>
            )}
          </div>
        </div>

        {/* Complete Block CTA */}
        <Button
          className={cn(
            'w-full transition-all text-base',
            !isCurrentBlockComplete && 'bg-white/[0.12] text-foreground shadow-none hover:bg-white/[0.16]'
          )}
          size="lg"
          onClick={handleBlockComplete}
        >
          {currentBlockIndex < totalBlocks - 1 ? 'Next block' : 'Finish'}
        </Button>

        {/* Block dot navigation */}
        {totalBlocks > 1 && <div className="flex justify-center gap-2 mt-5">
          {workoutData.blocks.map((block, index) => (
            <button
              key={block.id}
              onClick={() => setCurrentBlockIndex(index)}
              className={cn(
                'rounded-full transition-all duration-200',
                index === currentBlockIndex
                  ? 'w-6 h-2 bg-primary'
                  : block.completed
                    ? 'w-2 h-2 bg-success'
                    : 'w-2 h-2 bg-secondary'
              )}
            />
          ))}
        </div>}
      </div>

      {/* Rest timer — floats above content while a set rests */}
      {rest && (
        <RestTimer
          endsAt={rest.endsAt}
          total={rest.total}
          soundEnabled={settings?.restTimerSound ?? true}
          hapticEnabled={settings?.hapticFeedback ?? true}
          onAdjust={(delta) => setRest(r => r ? { ...r, endsAt: Math.max(Date.now(), r.endsAt + delta * 1000), total: Math.max(15, r.total + delta) } : r)}
          onDismiss={() => setRest(null)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Rest timer — countdown pill fixed above the bottom, auto-started on set done
// ============================================================================

function RestTimer({
  endsAt,
  total,
  soundEnabled,
  hapticEnabled,
  onAdjust,
  onDismiss,
}: {
  endsAt: number
  total: number
  soundEnabled: boolean
  hapticEnabled: boolean
  onAdjust: (deltaSeconds: number) => void
  onDismiss: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const firedRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  // Reset the "fired" latch whenever the target time changes (new rest / adjust).
  useEffect(() => { firedRef.current = false }, [endsAt])

  const remainingMs = endsAt - now
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000))

  // Chime + buzz exactly once when the countdown hits zero.
  useEffect(() => {
    if (remainingMs <= 0 && !firedRef.current) {
      firedRef.current = true
      playChime(soundEnabled)
      triggerHaptic(hapticEnabled, [80, 40, 80])
    }
  }, [remainingMs, soundEnabled, hapticEnabled])

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const label = `${mins}:${String(secs).padStart(2, '0')}`
  const done = remaining === 0
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4 pointer-events-none">
      <div className={cn(
        'pointer-events-auto max-w-lg mx-auto rounded-full glass-bar pl-2 pr-2 py-2 flex items-center gap-2',
        done && 'ring-1 ring-emerald-400/50'
      )}>
        <button
          onClick={() => onAdjust(-15)}
          className="h-10 w-10 shrink-0 rounded-full glass-soft text-foreground font-semibold text-xs tabular-nums active:scale-95 transition-transform"
          aria-label="Subtract 15 seconds"
        >
          −15
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {done ? 'Rest done' : 'Rest'}
            </span>
            <span className={cn('text-lg font-semibold tabular-nums leading-none', !done && remaining <= 3 && 'animate-pulse')}>{label}</span>
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-200', done ? 'bg-emerald-400' : 'bg-white')}
              style={{ width: `${done ? 100 : pct}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => onAdjust(15)}
          className="h-10 w-10 shrink-0 rounded-full glass-soft text-foreground font-semibold text-xs tabular-nums active:scale-95 transition-transform"
          aria-label="Add 15 seconds"
        >
          +15
        </button>
        <button
          onClick={onDismiss}
          className={cn(
            'h-10 px-4 shrink-0 rounded-full font-semibold text-sm transition-colors',
            done ? 'bg-emerald-400 text-black' : 'bg-white text-black'
          )}
          aria-label="Dismiss rest timer"
        >
          {done ? 'Done' : 'Skip'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Elapsed session clock — live count-up from when the workout was started
// ============================================================================

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

function ElapsedClock({ startedAt }: { startedAt?: Date | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!startedAt) return null
  const elapsed = now - new Date(startedAt).getTime()

  return (
    <span className="px-1 text-[15px] font-semibold text-foreground tabular-nums" aria-label="Elapsed workout time">
      {formatElapsed(elapsed)}
    </span>
  )
}

// ============================================================================
// Readiness banner — surfaces the local readiness score + how loads adjusted
// ============================================================================

function ReadinessBanner({
  readiness,
  onLogCheckIn,
}: {
  readiness: ReadinessResult | null | undefined
  onLogCheckIn: () => void
}) {
  // Still loading the live query.
  if (readiness === undefined) return null

  // No check-in today — nudge to log one, non-blocking.
  if (readiness === null) {
    return (
      <div className="px-4 pt-1">
        <button
          onClick={onLogCheckIn}
          className="w-full flex items-center gap-3 rounded-full glass-soft pl-4 pr-3 h-11 text-left active:scale-[0.99] transition-transform"
        >
          <span className="h-2 w-2 rounded-full bg-white/30" aria-hidden />
          <span className="text-sm text-foreground/85 flex-1">Check in to adjust weights</span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
    )
  }

  const { label, tone } = readinessDisplay(readiness.recommendation)
  const dot: Record<typeof tone, string> = {
    good: 'bg-emerald-400',
    neutral: 'bg-sky-400',
    warn: 'bg-amber-400',
    bad: 'bg-red-400',
  }

  return (
    <div className="px-4 pt-1">
      <div className="glass-soft rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', dot[tone])} aria-hidden />
          <span className="text-sm font-semibold tabular-nums">Readiness {readiness.overallScore}</span>
          <span className="text-sm text-muted-foreground">· {label}</span>
        </div>
        <p className="text-xs mt-0.5 text-muted-foreground">{readiness.reasoning}</p>
      </div>
    </div>
  )
}

// ============================================================================
// Exercise Block — collapsible card with plain-input set rows + add-set
// ============================================================================

function ExerciseBlock({
  exerciseInstance,
  userId,
  workoutId,
  workoutCompletedAt,
  isExpanded,
  onToggleExpand,
  onSetCompleted,
  weightUnit,
  inGroup,
}: {
  exerciseInstance: {
    id: string
    exerciseId: string
    exercise?: Partial<Exercise> & { name: string; cues: string[] }
    sets: SetInstance[]
    notes: string
  }
  userId?: string
  /** The session being logged — left out of "last time" so it never shows itself. */
  workoutId?: string
  /** Set when reopening a finished session: "last time" then means before it. */
  workoutCompletedAt?: Date | null
  /** Controlled by parent so it can auto-advance between exercises. */
  isExpanded: boolean
  onToggleExpand: () => void
  /** Fired when a set is newly checked complete (drives rest timer + haptics). */
  onSetCompleted: () => void
  weightUnit: 'lbs' | 'kg'
  /** Inside a superset the group draws the glass. */
  inGroup?: boolean
}) {
  const inputKind = getExerciseInputKind(exerciseInstance.exercise)
  const isCardio = inputKind === 'cardio'
  const distanceUnit = distanceUnitFor(weightUnit)

  const [historyOpen, setHistoryOpen] = useState(false)

  // Highest planned/logged working weight — the anchor for warmup generation.
  const workingWeight = exerciseInstance.sets
    .filter(s => s.setType !== 'warmup')
    .reduce((max, s) => Math.max(max, s.actualWeight ?? s.targetWeight ?? 0), 0)
  const hasWarmup = exerciseInstance.sets.some(s => s.setType === 'warmup')

  // Per-row labels: warmups read W1, W2…; working sets renumber from 1.
  let warmCount = 0
  let workCount = 0
  const rowLabels = exerciseInstance.sets.map(s => {
    if (s.setType === 'warmup') { warmCount += 1; return `W${warmCount}` }
    workCount += 1
    return `${workCount}`
  })

  // Live queries so the PR chip updates mid-session as records land.
  const prWeight = useLiveQuery(async () => {
    if (isCardio || !userId || !exerciseInstance.exerciseId) return null
    const record = await getBestLift(userId, exerciseInstance.exerciseId)
    return record?.weight ?? null
  }, [userId, exerciseInstance.exerciseId, isCardio]) ?? null
  // Most recent earlier session of this exercise (every working set), shown
  // beside the PR. Excludes the session in progress.
  const completedAtMs = workoutCompletedAt ? new Date(workoutCompletedAt).getTime() : null
  const lastSession = useLiveQuery(async () => {
    if (!userId || !exerciseInstance.exerciseId) return null
    return getLastExerciseSession(userId, exerciseInstance.exerciseId, {
      excludeWorkoutId: workoutId,
      before: completedAtMs != null ? new Date(completedAtMs) : null,
    })
  }, [userId, exerciseInstance.exerciseId, workoutId, completedAtMs]) ?? null
  const lastSessionDate = lastSession
    ? new Date(lastSession.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  const lastSessionSummary = lastSession
    ? formatSessionSummary(lastSession.sets, weightUnit, isCardio)
    : null

  const completedSets = exerciseInstance.sets.filter(s => s.completed).length
  const totalSets = exerciseInstance.sets.length
  const allDone = completedSets === totalSets && totalSets > 0
  const setLabel = isCardio ? (totalSets === 1 ? 'session' : 'sessions') : 'sets'

  const muscles = exerciseInstance.exercise?.primaryMuscles
    ? exerciseInstance.exercise.primaryMuscles.slice(0, 2).map(m => m.replace(/_/g, ' ')).join(' · ')
    : null

  return (
    <motion.div
      layout
      transition={{ layout: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
      className={cn(
        'overflow-hidden',
        !inGroup && 'glass rounded-3xl',
        allDone && !isExpanded && 'opacity-70'
      )}
    >
      {/* Header — tap to toggle */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {allDone && (
            <span className="h-6 w-6 rounded-full bg-emerald-400 text-black flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
          <div className="min-w-0">
            <h4 className="font-semibold text-[16px] tracking-tight text-foreground truncate">
              {exerciseInstance.exercise?.name || 'Exercise'}
            </h4>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {completedSets}/{totalSets} {setLabel}
              {muscles && ` · ${muscles}`}
              {prWeight && !isCardio && ` · PR ${prWeight} ${weightUnit}`}
            </p>
            {lastSessionSummary && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                Last {lastSessionDate}: <span className="font-medium text-foreground/80 tabular-nums">{lastSessionSummary}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex gap-1">
            {exerciseInstance.sets.map((s, i) => (
              <div
                key={i}
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  s.completed ? 'bg-foreground' : 'bg-foreground/20'
                )}
              />
            ))}
          </div>
          <svg
            viewBox="0 0 24 24"
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isExpanded && 'rotate-180'
            )}
            fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* History sheet */}
      {userId && (
        <ExerciseHistorySheet
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          userId={userId}
          exerciseId={exerciseInstance.exerciseId}
          exerciseName={exerciseInstance.exercise?.name || 'Exercise'}
          weightUnit={weightUnit}
          isCardio={isCardio}
          distanceUnit={distanceUnit}
        />
      )}

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0.5">
              {/* Last session — every working set from the most recent earlier
                  session of this exercise, so you can match or beat it set by set.
                  Today's targets below are pre-filled from it with progression. */}
              {lastSession && lastSession.sets.length > 0 && (
                <div className="mt-1 glass-soft rounded-2xl px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 mb-1">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v5h5" />
                      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                    </svg>
                    <span>
                      Last time · {new Date(lastSession.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {lastSession.sets.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 tabular-nums">
                        <span className="w-4 font-mono text-muted-foreground">{i + 1}</span>
                        {isCardio ? (
                          <span className="font-semibold text-foreground/80">
                            {secondsToMinutes(s.duration) ?? '—'} min
                            {s.distance != null && <span className="font-normal text-muted-foreground"> · {s.distance} {distanceUnit}</span>}
                          </span>
                        ) : (
                          <span className="font-semibold text-foreground/80">
                            {s.weight != null && s.weight > 0 ? `${s.weight} ${weightUnit}` : 'BW'}
                            <span className="font-normal text-muted-foreground"> × {s.reps ?? '—'}</span>
                          </span>
                        )}
                        {s.rpe != null && <span className="font-mono text-muted-foreground">@{s.rpe}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Column labels — cardio swaps Weight/Reps/RPE for Time/Distance/RPE */}
              <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem] gap-2 px-1.5 pb-1.5 pt-3 text-[11px] font-medium text-center text-muted-foreground">
                <span>{isCardio ? '#' : 'Set'}</span>
                <span>{isCardio ? 'Min' : weightUnit === 'lbs' ? 'lb' : 'kg'}</span>
                <span>{isCardio ? distanceUnit : 'Reps'}</span>
                <span>RPE</span>
                <span />
              </div>

              <div className="flex flex-col gap-1">
                {exerciseInstance.sets.map((set, idx) => (
                  <SetEditableRow
                    key={set.id}
                    set={set}
                    displayLabel={rowLabels[idx]}
                    weightUnit={weightUnit}
                    isCardio={isCardio}
                    distanceUnit={distanceUnit}
                    onSetCompleted={onSetCompleted}
                  />
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => appendSetToExercise(exerciseInstance.id)}
                  className="flex-1 flex items-center justify-center gap-2 h-10 rounded-full glass-soft text-[13px] font-medium text-foreground/80 hover:text-foreground transition-colors active:scale-[0.985]"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  {isCardio ? 'Add session' : 'Add set'}
                </button>

                {!isCardio && !hasWarmup && workingWeight > 0 && (
                  <button
                    onClick={() => addWarmupSets(exerciseInstance.id, workingWeight, weightUnit)}
                    className="flex-1 flex items-center justify-center gap-2 h-10 rounded-full glass-soft text-[13px] font-medium text-foreground/80 hover:text-foreground transition-colors active:scale-[0.985]"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6M4.9 7l4.2 2.4M19.1 7l-4.2 2.4M12 22a7 7 0 0 0 7-7 7 7 0 0 0-14 0 7 7 0 0 0 7 7z" /></svg>
                    Add warm-up
                  </button>
                )}
              </div>

              <button
                onClick={() => setHistoryOpen(true)}
                className="mt-1.5 w-full flex items-center justify-center gap-2 h-9 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l3 2" /></svg>
                History
              </button>

              {exerciseInstance.exercise?.cues && exerciseInstance.exercise.cues.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2 px-1 leading-relaxed">
                  {exerciseInstance.exercise.cues.join(' · ')}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ============================================================================
// Exercise history sheet — last several logged sessions for one exercise
// ============================================================================

function ExerciseHistorySheet({
  open,
  onClose,
  userId,
  exerciseId,
  exerciseName,
  weightUnit,
  isCardio,
  distanceUnit,
}: {
  open: boolean
  onClose: () => void
  userId: string
  exerciseId: string
  exerciseName: string
  weightUnit: 'lbs' | 'kg'
  isCardio: boolean
  distanceUnit: 'mi' | 'km'
}) {
  const [sessions, setSessions] = useState<ExerciseHistorySession[] | null>(null)

  useEffect(() => {
    if (!open) return
    setSessions(null)
    getExerciseHistory(userId, exerciseId, 10).then(setSessions)
  }, [open, userId, exerciseId])

  return (
    <Sheet open={open} onClose={onClose} title={exerciseName}>
      {sessions === null ? (
        <div className="py-10 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No history yet — complete a session with this exercise and it'll show up here.
        </p>
      ) : (
        <div className="space-y-4 pb-2">
          {sessions.map(session => (
            <div key={session.workoutId}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                {new Date(session.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
              <div className="space-y-1">
                {session.sets.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-secondary/40 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>
                    <div className="flex items-center gap-2">
                      {isCardio ? (
                        <span className="font-semibold tabular-nums">
                          {secondsToMinutes(s.duration) ?? '—'} min
                          {s.distance != null && <span className="text-muted-foreground font-normal"> · {s.distance} {distanceUnit}</span>}
                        </span>
                      ) : (
                        <>
                          <span className="font-semibold tabular-nums">{s.weight ?? '—'} {weightUnit}</span>
                          <span className="text-muted-foreground">× {s.reps ?? '—'}</span>
                        </>
                      )}
                      {s.rpe != null && <span className="text-xs font-mono text-muted-foreground">@{s.rpe}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

// ============================================================================
// Set Row — single tappable row with plain text inputs (no steppers)
// ============================================================================

function SetEditableRow({
  set,
  displayLabel,
  weightUnit,
  isCardio = false,
  distanceUnit = 'mi',
  onSetCompleted,
}: {
  set: SetInstance
  displayLabel: string
  weightUnit: 'lbs' | 'kg'
  isCardio?: boolean
  distanceUnit?: 'mi' | 'km'
  onSetCompleted?: () => void
}) {
  const isWarmup = set.setType === 'warmup'
  // Show actual if logged, otherwise fall back to target as a placeholder hint.
  // Strength columns track weight + reps; cardio columns track duration + distance.
  const weightDisplay = set.actualWeight ?? set.targetWeight
  const repsDisplay = set.actualReps ?? set.targetReps
  const rpeDisplay = set.actualRPE ?? set.targetRPE
  // Display duration as minutes (1 decimal) — storage stays in seconds.
  const durationMinDisplay = secondsToMinutes(set.actualDuration ?? set.targetDuration)
  const distanceDisplay = set.actualDistance ?? set.targetDistance ?? null

  // Local text state for each field — synced FROM DB on changes elsewhere,
  // synced TO DB onBlur. Lets the user type freely without the field snapping
  // back to a stale value mid-edit.
  const [weightText, setWeightText] = useState<string>(weightDisplay != null ? String(weightDisplay) : '')
  const [repsText, setRepsText] = useState<string>(repsDisplay != null ? String(repsDisplay) : '')
  const [rpeText, setRpeText] = useState<string>(rpeDisplay != null ? String(rpeDisplay) : '')
  const [durationText, setDurationText] = useState<string>(durationMinDisplay != null ? String(durationMinDisplay) : '')
  const [distanceText, setDistanceText] = useState<string>(distanceDisplay != null ? String(distanceDisplay) : '')

  // When the DB value changes externally (e.g. another tab), reflect it locally.
  useEffect(() => {
    setWeightText(weightDisplay != null ? String(weightDisplay) : '')
  }, [weightDisplay])
  useEffect(() => {
    setRepsText(repsDisplay != null ? String(repsDisplay) : '')
  }, [repsDisplay])
  useEffect(() => {
    setRpeText(rpeDisplay != null ? String(rpeDisplay) : '')
  }, [rpeDisplay])
  useEffect(() => {
    setDurationText(durationMinDisplay != null ? String(durationMinDisplay) : '')
  }, [durationMinDisplay])
  useEffect(() => {
    setDistanceText(distanceDisplay != null ? String(distanceDisplay) : '')
  }, [distanceDisplay])

  const commit = async (patch: Partial<SetInstance>) => {
    await db.setInstances.update(set.id, patch)
    // Editing an already-completed set (e.g. correcting the weight) must keep
    // the live lift record in step. Best-effort — never blocks the edit.
    if (set.completed && !isWarmup && !isCardio) {
      void syncLiftRecordForSet(set.id).catch(() => {})
    }
  }

  const commitWeight = () => {
    const v = weightText.trim()
    if (v === '') return commit({ actualWeight: null })
    const n = parseFloat(v)
    if (!Number.isFinite(n)) return
    return commit({ actualWeight: n })
  }
  const commitReps = () => {
    const v = repsText.trim()
    if (v === '') return commit({ actualReps: null })
    const n = parseInt(v, 10)
    if (!Number.isFinite(n)) return
    return commit({ actualReps: n })
  }
  const commitRpe = () => {
    const v = rpeText.trim()
    if (v === '') return commit({ actualRPE: null })
    const n = parseInt(v, 10)
    if (!Number.isFinite(n)) return
    return commit({ actualRPE: Math.min(Math.max(n, 1), 10) })
  }
  const commitDuration = () => {
    const v = durationText.trim()
    if (v === '') return commit({ actualDuration: null })
    const n = parseFloat(v)
    if (!Number.isFinite(n)) return
    return commit({ actualDuration: minutesToSeconds(n) })
  }
  const commitDistance = () => {
    const v = distanceText.trim()
    if (v === '') return commit({ actualDistance: null })
    const n = parseFloat(v)
    if (!Number.isFinite(n)) return
    return commit({ actualDistance: n })
  }

  const toggleComplete = async () => {
    const willComplete = !set.completed
    // Persist any in-flight typing first.
    if (isCardio) {
      await Promise.all([commitDuration(), commitDistance(), commitRpe()])
    } else {
      await Promise.all([commitWeight(), commitReps(), commitRpe()])
    }
    await db.setInstances.update(set.id, { completed: willComplete })
    // Live lift record: recompute this exercise's best-of-workout immediately
    // so Records/e1RM update without waiting for the session to finish.
    if (!isWarmup && !isCardio) {
      void syncLiftRecordForSet(set.id).catch(() => {})
    }
    // Warmups don't trigger a rest — you flow straight into the next ramp set.
    if (willComplete && !isWarmup) onSetCompleted?.()
  }

  // Progression signal: did a completed working set hit its target reps?
  let progression: 'up' | 'down' | null = null
  if (set.completed && !isCardio && !isWarmup && set.targetReps != null && set.actualReps != null) {
    progression = set.actualReps >= set.targetReps ? 'up' : 'down'
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem] gap-2 items-center rounded-2xl px-1.5 py-1 transition-colors',
        set.completed ? 'bg-emerald-400/[0.08]' : isWarmup ? 'bg-amber-300/[0.05]' : ''
      )}
    >
      <span className={cn(
        'text-sm font-mono tabular-nums text-center flex items-center justify-center gap-0.5',
        isWarmup ? 'text-rpe-moderate' : set.completed ? 'text-foreground/80' : 'text-muted-foreground'
      )}>
        {displayLabel}
        {progression === 'up' && <span className="text-success text-[10px] leading-none" title="Hit target reps">▲</span>}
        {progression === 'down' && <span className="text-rpe-high text-[10px] leading-none" title="Under target reps">▼</span>}
      </span>

      {isCardio ? (
        <>
          <CellInput
            value={durationText}
            onChange={setDurationText}
            onBlur={commitDuration}
            placeholder={set.targetDuration != null ? String(secondsToMinutes(set.targetDuration)) : '–'}
            ariaLabel={`Session ${displayLabel} duration in minutes`}
            completed={set.completed}
            allowDecimal
          />
          <CellInput
            value={distanceText}
            onChange={setDistanceText}
            onBlur={commitDistance}
            placeholder={set.targetDistance != null ? String(set.targetDistance) : '–'}
            ariaLabel={`Session ${displayLabel} distance in ${distanceUnit}`}
            completed={set.completed}
            allowDecimal
          />
        </>
      ) : (
        <>
          <CellInput
            value={weightText}
            onChange={setWeightText}
            onBlur={commitWeight}
            placeholder={set.targetWeight != null ? String(set.targetWeight) : '–'}
            ariaLabel={`Set ${displayLabel} weight in ${weightUnit}`}
            completed={set.completed}
            allowDecimal
          />
          <CellInput
            value={repsText}
            onChange={setRepsText}
            onBlur={commitReps}
            placeholder={set.targetReps != null ? String(set.targetReps) : '–'}
            ariaLabel={`Set ${displayLabel} reps`}
            completed={set.completed}
          />
        </>
      )}
      <CellInput
        value={rpeText}
        onChange={setRpeText}
        onBlur={commitRpe}
        placeholder={set.targetRPE != null ? String(set.targetRPE) : '–'}
        ariaLabel={`Set ${displayLabel} RPE`}
        completed={set.completed}
      />

      <motion.button
        onClick={toggleComplete}
        whileTap={{ scale: 0.85 }}
        animate={set.completed ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
        className={cn(
          'h-10 w-10 flex items-center justify-center rounded-full transition-colors touch-target shrink-0',
          set.completed
            ? 'bg-emerald-400 text-black'
            : 'glass-soft text-muted-foreground hover:text-foreground'
        )}
        aria-label={set.completed ? 'Mark set incomplete' : 'Mark set complete'}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </motion.button>
    </div>
  )
}

function CellInput({
  value,
  onChange,
  onBlur,
  placeholder,
  ariaLabel,
  completed,
  allowDecimal,
}: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void | Promise<void>
  placeholder?: string
  ariaLabel?: string
  completed?: boolean
  allowDecimal?: boolean
}) {
  return (
    <input
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      pattern={allowDecimal ? '[0-9.]*' : '[0-9]*'}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        const cleaned = e.target.value.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '')
        onChange(cleaned)
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={onBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={cn(
        'h-10 w-full text-center rounded-xl bg-white/[0.06] border border-white/[0.06] px-1 text-[17px] font-semibold tabular-nums',
        'focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/[0.1]',
        'placeholder:text-muted-foreground/40 transition-colors',
        completed ? 'text-foreground' : 'text-foreground'
      )}
    />
  )
}

// ============================================================================
// Warmup & Cooldown (mobility drills matched to the day's muscles)
// ============================================================================

/** The slice of getWorkoutWithDetails both mobility surfaces need. */
interface MobilityWorkout {
  id: string
  warmupDone?: string[]
  cooldownDone?: string[]
  warmupPlan?: PlanDrill[]
  cooldownPlan?: PlanDrill[]
  blocks: { exercises: { exercise?: Partial<Exercise>; sets: SetInstance[] }[] }[]
}

/** Coach-written warm-up or cool-down lines as checklist drills (ids stable per position). */
function planDrills(list: PlanDrill[] | undefined, prefix: string): MobilityDrill[] | null {
  if (!list || list.length === 0) return null
  return list.map((d, i) => ({
    id: `${prefix}-${i}`,
    name: d.name,
    kind: prefix === 'warm' ? ('dynamic_warmup' as const) : ('stretch' as const),
    targets: [],
    reps: d.dose,
    cue: d.cue ?? '',
  }))
}

function DrillRow({
  drill,
  done,
  onToggle,
}: {
  drill: MobilityDrill
  done: boolean
  onToggle: () => void
}) {
  const dose = drill.reps ?? (drill.durationSeconds ? `${drill.durationSeconds}s` : '')
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors',
        done ? 'bg-white/[0.03]' : 'glass-soft'
      )}
    >
      <span
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
          done ? 'bg-emerald-400 border-emerald-400 text-black' : 'border-white/30'
        )}
      >
        {done && (
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('text-sm font-semibold', done && 'text-muted-foreground line-through')}>{drill.name}</span>
          {dose && <span className="text-xs text-muted-foreground tabular-nums shrink-0">{dose}</span>}
        </span>
        {drill.cue && <span className="block text-xs text-muted-foreground mt-0.5">{drill.cue}</span>}
      </span>
    </button>
  )
}

function WarmupSection({ workout }: { workout: MobilityWorkout }) {
  const exercises = workout.blocks.flatMap(b => b.exercises.map(e => e.exercise))
  const exerciseKey = workout.blocks
    .flatMap(b => b.exercises.map(e => e.exercise?.id ?? ''))
    .join(',')
  const drills = useMemo(
    () => planDrills(workout.warmupPlan, 'warm') ?? getWarmupDrills(exercises, workout.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workout.id, exerciseKey, workout.warmupPlan]
  )

  const done = new Set(workout.warmupDone ?? [])
  const doneCount = drills.filter(d => done.has(d.id)).length
  const allDone = doneCount === drills.length && drills.length > 0
  const anyWorkingSetDone = workout.blocks.some(b =>
    b.exercises.some(e => e.sets.some(s => s.completed))
  )

  // Auto-collapsed once the warmup is finished or the session is underway;
  // the user can always reopen manually.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const isOpen = manualOpen ?? !(allDone || anyWorkingSetDone)

  if (drills.length === 0) return null

  const toggleDrill = (id: string) => {
    const next = done.has(id)
      ? [...done].filter(x => x !== id)
      : [...done, id]
    void patchWorkout(workout.id, { warmupDone: next })
  }

  return (
    <div className="glass rounded-3xl overflow-hidden mb-3">
      <button
        onClick={() => setManualOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[16px] font-semibold tracking-tight">Warm-up</span>
          <span className={cn('text-xs tabular-nums', allDone ? 'text-foreground' : 'text-muted-foreground')}>
            {doneCount}/{drills.length}
          </span>
        </div>
        <svg
          viewBox="0 0 24 24"
          className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
          fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5">
              {drills.map(d => (
                <DrillRow key={d.id} drill={d} done={done.has(d.id)} onToggle={() => toggleDrill(d.id)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CooldownScreen({
  workout,
  onContinue,
}: {
  workout: MobilityWorkout
  onContinue: () => void
}) {
  const exercises = workout.blocks.flatMap(b => b.exercises.map(e => e.exercise))
  const stretches = useMemo(
    () => planDrills(workout.cooldownPlan, 'cool') ?? getCooldownStretches(exercises, workout.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workout.id, workout.cooldownPlan]
  )
  const done = new Set(workout.cooldownDone ?? [])
  const doneCount = stretches.filter(d => done.has(d.id)).length

  const toggleDrill = (id: string) => {
    const next = done.has(id)
      ? [...done].filter(x => x !== id)
      : [...done, id]
    void patchWorkout(workout.id, { cooldownDone: next })
  }

  return (
    <div className="min-h-screen pb-32">
      <header className="px-5 pt-12 pb-6">
        <p className="eyebrow">Session complete</p>
        <h1 className="text-[30px] font-bold tracking-tight mt-1">Cool down</h1>
      </header>

      <div className="px-5 space-y-1.5">
        <div className="flex items-baseline justify-between px-1 pb-1">
          <span className="eyebrow">Stretches</span>
          <span className="text-xs text-muted-foreground tabular-nums">{doneCount}/{stretches.length}</span>
        </div>
        {stretches.map(d => (
          <DrillRow key={d.id} drill={d} done={done.has(d.id)} onToggle={() => toggleDrill(d.id)} />
        ))}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto glass-bar rounded-full p-1.5 flex gap-1.5">
          <Button variant="ghost" onClick={onContinue} className="flex-1">
            Skip
          </Button>
          <Button onClick={onContinue} className="flex-[2]">
            Check-in
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Reflection Form
// ============================================================================

function ReflectionForm({
  workoutId,
  workoutName,
  userId,
  onComplete,
}: {
  workoutId: string
  workoutName: string
  userId: string
  onComplete: () => void
}) {
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationData, setCelebrationData] = useState<{
    newStreak: number; totalWorkouts: number; newAchievements: AchievementId[]
  } | null>(null)

  // Runs after the unified check-in form has written the dailyCheckIn +
  // workoutReflection rows: finalize the workout and fire celebrations.
  const handleSubmitted = async ({ energy }: { energy: number; overall: number }) => {
    await db.workouts.update(workoutId, { status: 'completed', completedAt: new Date() })

    // Record real duration + lift PRs from the completed sets (idempotent
    // safety net over the live per-set records).
    const prAchievements = await recordWorkoutResults(workoutId)
    requestCatoSync() // push today's session to Cato (no-op unless the sync is on)

    const user = await getCurrentUser()
    if (user) {
      const streakAchievements = await updateStreakOnWorkoutComplete(user.id)
      const timeAchievements = await checkTimeBasedAchievements(user.id)
      const ironWillUnlocked = await checkIronWillAchievement(user.id, energy)
      const updatedUser = await getCurrentUser()
      setCelebrationData({
        newStreak: updatedUser?.currentStreak ?? 1,
        totalWorkouts: updatedUser?.totalWorkoutsCompleted ?? 1,
        newAchievements: [
          ...streakAchievements,
          ...timeAchievements,
          ...prAchievements,
          ...(ironWillUnlocked ? ['iron_will' as AchievementId] : []),
        ],
      })
      setShowCelebration(true)
    } else {
      onComplete()
    }
  }

  if (showCelebration && celebrationData) {
    return (
      <CelebrationScreen
        workoutName={workoutName}
        streak={celebrationData.newStreak}
        totalWorkouts={celebrationData.totalWorkouts}
        newAchievements={celebrationData.newAchievements}
        onContinue={onComplete}
      />
    )
  }

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen pb-32">
      <header className="px-5 pt-12 pb-6">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{dateLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Check-in</h1>
        <p className="text-sm text-muted-foreground mt-1">{workoutName} — this also counts as today's daily check-in</p>
      </header>

      <div className="px-5">
        <CheckInForm
          userId={userId}
          workoutId={workoutId}
          onSubmitted={handleSubmitted}
          renderActions={({ submit, isSaving }) => (
            /* Sticky action bar */
            <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
              <div className="max-w-lg mx-auto glass-bar rounded-full p-1.5 flex gap-1.5">
                <Button
                  variant="ghost"
                  onClick={async () => {
                    // Skip means: still mark the workout completed, just no journal entry.
                    await db.workouts.update(workoutId, { status: 'completed', completedAt: new Date() })
                    await recordWorkoutResults(workoutId)
                    requestCatoSync()
                    const u = await getCurrentUser()
                    if (u) await updateStreakOnWorkoutComplete(u.id)
                    onComplete()
                  }}
                  className="flex-1"
                >
                  Skip
                </Button>
                <Button onClick={submit} loading={isSaving} className="flex-[2]">
                  Finish
                </Button>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Celebration Screen
// ============================================================================

function CelebrationScreen({
  workoutName, streak, totalWorkouts, newAchievements, onContinue,
}: {
  workoutName: string
  streak: number
  totalWorkouts: number
  newAchievements: AchievementId[]
  onContinue: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col safe-area-inset">
      <main className="flex-1 flex flex-col items-center justify-center px-6 max-w-md mx-auto w-full text-center">
        {/* Hero — checkmark glyph, scales in, with a small particle burst */}
        <div className="relative mb-6">
          {Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2
            return (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, scale: 1, opacity: 0.9 }}
                animate={{
                  x: Math.cos(angle) * 64,
                  y: Math.sin(angle) * 64,
                  scale: 0,
                  opacity: 0,
                }}
                transition={{ duration: 0.7, delay: 0.25, ease: 'easeOut' }}
                className={cn(
                  'absolute left-1/2 top-1/2 h-2 w-2 -ml-1 -mt-1 rounded-full pointer-events-none',
                  i % 3 === 0 ? 'bg-foreground' : i % 3 === 1 ? 'bg-foreground/60' : 'bg-foreground/30'
                )}
                aria-hidden
              />
            )
          })}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            className="h-20 w-20 rounded-full bg-foreground text-background flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          </motion.div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="text-2xl font-bold tracking-tight"
        >
          Workout complete
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="text-sm text-muted-foreground mt-1 mb-8"
        >
          {workoutName}
        </motion.p>

        {/* Stats — two columns, no overlapping cards */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.3 }}
          className="w-full grid grid-cols-2 gap-3 mb-6"
        >
          <div className="glass rounded-3xl p-4 text-left">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Streak</p>
            <p className="text-3xl font-bold tabular-nums mt-1">{streak}<span className="text-sm text-muted-foreground font-normal ml-1">days</span></p>
          </div>
          <div className="glass rounded-3xl p-4 text-left">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</p>
            <p className="text-3xl font-bold tabular-nums mt-1">{totalWorkouts}<span className="text-sm text-muted-foreground font-normal ml-1">workouts</span></p>
          </div>
        </motion.div>

        {/* Achievements — only render if any. Inline list, no popup. */}
        {newAchievements.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.36, duration: 0.3 }}
            className="w-full mb-6"
          >
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2 text-left">New achievements</p>
            <div className="space-y-2">
              {newAchievements.map(id => {
                const a = ACHIEVEMENTS[id]
                if (!a) return null
                return (
                  <div key={id} className="glass-soft rounded-2xl p-3 flex items-center gap-3 text-left">
                    <span className="text-2xl">{a.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </main>

      <div className="px-6 pb-8 safe-area-bottom max-w-md mx-auto w-full">
        <Button size="lg" onClick={onContinue} className="w-full">Continue</Button>
      </div>
    </div>
  )
}

// ============================================================================
// Workout Summary (History View)
// ============================================================================

function WorkoutSummary({
  workout,
  onBack,
  weightUnit,
}: {
  workout: {
    id: string
    name: string
    workoutType?: string
    completedAt?: Date | null
    totalDuration?: number
    userId?: string
    blocks: Array<{
      id: string
      type: string
      exercises: Array<{
        id: string
        exercise?: Partial<Exercise> & { name: string }
        sets: SetInstance[]
      }>
    }>
    reflection?: {
      energy: number
      performance: number
      overallSatisfaction: number
      winOfTheDay: string
      struggleOfTheDay: string
      freeformNotes: string
    } | null
  }
  onBack: () => void
  weightUnit: 'lbs' | 'kg'
}) {
  const distanceUnit = distanceUnitFor(weightUnit)
  const completedDate = workout.completedAt ? new Date(workout.completedAt) : null

  const hasBlockExercises = workout.blocks.some(block =>
    block.exercises.some(ex => ex.sets.some(s => s.completed))
  )

  const totalSets = workout.blocks.reduce(
    (acc, block) => acc + block.exercises.reduce((s, ex) => s + ex.sets.filter(s => s.completed).length, 0),
    0
  )

  return (
    <div className="min-h-screen pb-8">
      <header className="px-5 pt-12 pb-5 flex items-start gap-3">
        <button onClick={onBack} className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors -ml-1" aria-label="Back">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {completedDate ? completedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Completed'}
          </p>
          <h1 className="text-2xl font-bold tracking-tight mt-1 truncate">{workout.name}</h1>
        </div>
      </header>

      <div className="px-5 space-y-5">
        {/* Stat strip */}
        {completedDate && (
          <div className="flex gap-3">
            {totalSets > 0 && (
              <div className="flex-1 glass rounded-3xl p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sets</p>
                <p className="text-2xl font-bold tabular-nums mt-1">{totalSets}</p>
              </div>
            )}
            {workout.totalDuration && workout.totalDuration > 0 && (
              <div className="flex-1 glass rounded-3xl p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Time</p>
                <p className="text-2xl font-bold tabular-nums mt-1">{workout.totalDuration}<span className="text-sm text-muted-foreground font-normal ml-1">min</span></p>
              </div>
            )}
            <div className="flex-1 glass rounded-3xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">At</p>
              <p className="text-2xl font-bold tabular-nums mt-1">
                {completedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>
        )}

        {/* Journal entry */}
        {workout.reflection && (
          <section className="rounded-2xl bg-card border border-border/40 p-5">
            <div className="flex items-center justify-between mb-4 gap-3">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Journal</p>
              <div className="flex gap-4 text-right">
                {workout.reflection.overallSatisfaction > 0 && (
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Felt</p>
                    <p className="text-sm font-bold tabular-nums">{workout.reflection.overallSatisfaction}/10</p>
                  </div>
                )}
                {workout.reflection.energy > 0 && (
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Energy</p>
                    <p className="text-sm font-bold tabular-nums">{workout.reflection.energy}/10</p>
                  </div>
                )}
              </div>
            </div>

            {workout.reflection.freeformNotes && (
              <p className="text-base leading-relaxed text-foreground/90 mb-4 whitespace-pre-wrap">
                {workout.reflection.freeformNotes}
              </p>
            )}

            {(workout.reflection.winOfTheDay || workout.reflection.struggleOfTheDay) && (
              <div className="space-y-3 pt-3 border-t border-border/30">
                {workout.reflection.winOfTheDay && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Win</p>
                    <p className="text-sm mt-1 text-foreground/90">{workout.reflection.winOfTheDay}</p>
                  </div>
                )}
                {workout.reflection.struggleOfTheDay && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Challenge</p>
                    <p className="text-sm mt-1 text-foreground/90">{workout.reflection.struggleOfTheDay}</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {hasBlockExercises ? (
          <section className="rounded-2xl bg-card border border-border/40 p-5">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-4">Exercises</p>
            <div className="space-y-5">
              {workout.blocks.map(block =>
                block.exercises.map(exerciseInstance => {
                  const completedSets = exerciseInstance.sets.filter(s => s.completed)
                  if (completedSets.length === 0) return null
                  const isCardioEx = getExerciseInputKind(exerciseInstance.exercise) === 'cardio'
                  return (
                    <div key={exerciseInstance.id}>
                      <h4 className="font-semibold text-sm mb-2 truncate">{exerciseInstance.exercise?.name || 'Exercise'}</h4>
                      <div className="space-y-1">
                        {completedSets.map((set, index) => {
                          const rpe = set.actualRPE || set.targetRPE
                          return (
                            <div key={set.id} className="flex items-center justify-between text-sm bg-secondary/40 rounded-xl px-3 py-2">
                              <span className="text-xs text-muted-foreground font-mono">
                                {isCardioEx ? `#${index + 1}` : `Set ${index + 1}`}
                              </span>
                              <div className="flex items-center gap-3">
                                {isCardioEx ? (
                                  <>
                                    <span className="font-semibold">
                                      {secondsToMinutes(set.actualDuration ?? set.targetDuration) ?? '—'} min
                                    </span>
                                    {(set.actualDistance ?? set.targetDistance) != null && (
                                      <span className="text-muted-foreground">
                                        · {set.actualDistance ?? set.targetDistance} {distanceUnit}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className="font-semibold">{set.actualWeight ?? set.targetWeight ?? '—'} {weightUnit}</span>
                                    <span className="text-muted-foreground">× {set.actualReps ?? set.targetReps ?? '—'}</span>
                                  </>
                                )}
                                {rpe && (
                                  <span className="text-xs font-mono text-muted-foreground">@{rpe}</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-8">No exercise data recorded</p>
        )}
      </div>
    </div>
  )
}



// Group consecutive exercises sharing a supersetGroupId, matching the planner.
type ExecExercise = { id: string; exerciseId: string; exercise?: { name: string; cues: string[] }; sets: SetInstance[]; notes: string; supersetGroupId?: string | null }
type ExecGroup =
  | { kind: 'solo'; instance: ExecExercise }
  | { kind: 'group'; groupId: string; members: ExecExercise[] }

function groupExercisesBySuperset(exercises: ExecExercise[]): ExecGroup[] {
  const out: ExecGroup[] = []
  let i = 0
  while (i < exercises.length) {
    const ex = exercises[i]
    if (!ex.supersetGroupId) {
      out.push({ kind: 'solo', instance: ex })
      i++
      continue
    }
    const groupId = ex.supersetGroupId
    const members: ExecExercise[] = []
    while (i < exercises.length && exercises[i].supersetGroupId === groupId) {
      members.push(exercises[i])
      i++
    }
    if (members.length === 1) out.push({ kind: 'solo', instance: members[0] })
    else out.push({ kind: 'group', groupId, members })
  }
  return out
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-foreground/80 hover:bg-white/[0.07] active:bg-white/10 transition-colors"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  )
}
