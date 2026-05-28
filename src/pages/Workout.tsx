import { useState, useEffect, useRef } from 'react'
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
  promoteToInProgress,
  appendSetToExercise,
} from '@/db'
import { Button, Badge, Input, Slider } from '@/components/ui'
import {
  cn,
  generateId,
  getExerciseInputKind,
  distanceUnitFor,
  secondsToMinutes,
  minutesToSeconds,
} from '@/lib/utils'
import { BLOCK_CONFIG, ACHIEVEMENTS } from '@/lib/constants'
import type { BlockType, SetInstance, WorkoutReflection, AchievementId, Exercise } from '@/lib/types'


export function Workout() {
  const { workoutId } = useParams()
  const navigate = useNavigate()
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [showReflection, setShowReflection] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // Which exercise is currently expanded in the execution view. Auto-advances
  // when the active exercise becomes fully complete; user can override by tap.
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)

  const workoutData = useLiveQuery(
    async () => { if (!workoutId) return null; return getWorkoutWithDetails(workoutId) },
    [workoutId]
  )

  const user = useLiveQuery(() => getCurrentUser(), [])
  const weightUnit = user?.preferences.weightUnit ?? 'lbs'

  // The "active" exercise is the first one with at least one incomplete set.
  // When that changes (because the user just finished all sets in the previous
  // active exercise), we move the expansion to follow.
  const lastActiveRef = useRef<string | null>(null)
  useEffect(() => {
    if (!workoutData) return
    const exercises = workoutData.blocks.flatMap(b => b.exercises)
    const nextActive = exercises.find(ex => ex.sets.some(s => !s.completed))?.id ?? null

    // First time we ever see data, expand the active exercise.
    if (lastActiveRef.current === null && expandedExerciseId === null) {
      lastActiveRef.current = nextActive
      setExpandedExerciseId(nextActive)
      return
    }
    // When the active exercise actually changes (auto-advance trigger), follow.
    if (nextActive !== lastActiveRef.current) {
      lastActiveRef.current = nextActive
      setExpandedExerciseId(nextActive)
    }
  }, [workoutData, expandedExerciseId])

  // Guard against re-firing the status flip on every live-query re-emit.
  // Without this, the very update below triggers a re-fetch → re-render →
  // another update call, which can race or worse, repeatedly write the same row.
  const promotedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!workoutData) return
    const s = workoutData.status
    if (s !== 'planned' && s !== 'draft') return
    if (promotedRef.current === workoutData.id) return
    promotedRef.current = workoutData.id
    promoteToInProgress(workoutData.id)
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

  if (showReflection) {
    return (
      <ReflectionForm
        workoutId={workoutData.id}
        workoutName={workoutData.name}
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
      setShowReflection(true)
    }
  }

  const handleExit = () => setShowExitConfirm(true)

  return (
    <div className="min-h-screen bg-background pb-8">
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

      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border/30 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={handleExit}
            className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Exit workout"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="text-center min-w-0 px-2 flex-1">
            <p className="text-xs font-semibold text-muted-foreground truncate">{workoutData.name}</p>
            <p className="text-sm font-bold">
              Block {currentBlockIndex + 1} / {totalBlocks}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Edit workout (mid-session adjustments) */}
            <button
              onClick={() => navigate(`/plan/${workoutData.id}`)}
              className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Edit workout"
              title="Add/remove exercises or adjust sets"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>

            {/* Set counter */}
            <div className="flex items-center gap-1 bg-secondary/60 px-3 py-1.5 rounded-full">
              <span className="text-sm font-bold text-foreground">{totalSetsCompleted}</span>
              <span className="text-xs text-muted-foreground">/{totalSets}</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              progress === 100 ? 'bg-foreground' : 'bg-foreground/80'
            )}
            style={{ width: `${Math.max(progress, totalSets > 0 ? (totalSetsCompleted / totalSets) * 100 : 0)}%` }}
          />
          {totalSetsCompleted > 0 && totalSetsCompleted < totalSets && (
            <div className="absolute inset-0 progress-shimmer" />
          )}
        </div>
      </div>

      {/* Sets crushed banner */}
      {totalSetsCompleted > 0 && (
        <div className="px-4 pt-3 animate-slide-up">
          <div className="bg-primary/15 border border-primary/25 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <span className="text-lg">💪</span>
            <span className="text-sm font-bold text-primary">
              {totalSetsCompleted} set{totalSetsCompleted !== 1 ? 's' : ''} crushed!
            </span>
            <span className="ml-auto text-xs text-primary/70 font-medium">
              {totalSets - totalSetsCompleted > 0 ? `${totalSets - totalSetsCompleted} to go` : 'All done!'}
            </span>
          </div>
        </div>
      )}

      {/* Current Block */}
      <div className="p-4">
        <div className="rounded-2xl bg-card border border-border/50 shadow-card overflow-hidden mb-4">
          {/* Block header */}
          <div className="px-4 pt-4 pb-3 border-b border-border/40 bg-secondary/20">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 mr-3">
                <Badge
                  className={cn('mb-2 text-xs font-bold uppercase tracking-wider', BLOCK_CONFIG[currentBlock.type as BlockType]?.color)}
                  variant="outline"
                >
                  {BLOCK_CONFIG[currentBlock.type as BlockType]?.label || currentBlock.type}
                </Badge>
                <h2 className="text-base font-black text-foreground leading-tight">
                  {currentBlock.intent || BLOCK_CONFIG[currentBlock.type as BlockType]?.description}
                </h2>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-1 rounded-lg">
                  ~{currentBlock.timeTarget}m
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {currentBlockSetsCompleted}/{currentBlockTotalSets} sets
                </span>
              </div>
            </div>
          </div>

          {/* Exercises (with superset visual grouping) */}
          <div className="p-4">
            {currentBlock.exercises.length > 0 ? (
              <div className="space-y-3">
                {groupExercisesBySuperset(currentBlock.exercises).map((g) => {
                  if (g.kind === 'solo') {
                    return (
                      <ExerciseBlock
                        key={g.instance.id}
                        exerciseInstance={g.instance}
                        userId={workoutData.userId}
                        isExpanded={expandedExerciseId === g.instance.id}
                        onToggleExpand={() => setExpandedExerciseId(prev => prev === g.instance.id ? null : g.instance.id)}
                        weightUnit={weightUnit}
                      />
                    )
                  }
                  return (
                    <div key={g.groupId} className="rounded-2xl bg-foreground/[0.04] border border-foreground/15 p-2 space-y-2">
                      <div className="flex items-center gap-2 px-2 pt-1.5">
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-foreground/70">
                          Superset · {g.members.length} exercises
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Alternate sets
                        </span>
                      </div>
                      {g.members.map((m) => (
                        <ExerciseBlock
                          key={m.id}
                          exerciseInstance={m}
                          userId={workoutData.userId}
                          isExpanded={expandedExerciseId === m.id}
                          onToggleExpand={() => setExpandedExerciseId(prev => prev === m.id ? null : m.id)}
                          weightUnit={weightUnit}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-muted-foreground text-sm">{getBlockInstructions(currentBlock.type as BlockType)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Complete Block CTA */}
        <Button
          className={cn(
            'w-full transition-all text-base',
            isCurrentBlockComplete
              ? 'bg-foreground text-background hover:bg-foreground/90 border-0'
              : ''
          )}
          size="lg"
          onClick={handleBlockComplete}
        >
          {currentBlockIndex < totalBlocks - 1
            ? isCurrentBlockComplete
              ? <span className="flex items-center gap-2">🎯 Block Done — Next!</span>
              : 'Complete Block'
            : isCurrentBlockComplete
              ? <span className="flex items-center gap-2">🏆 Finish Workout!</span>
              : 'Finish & Reflect'
          }
        </Button>

        {/* Block dot navigation */}
        <div className="flex justify-center gap-2 mt-5">
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
        </div>
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
  isExpanded,
  onToggleExpand,
  weightUnit,
}: {
  exerciseInstance: {
    id: string
    exerciseId: string
    exercise?: Partial<Exercise> & { name: string; cues: string[] }
    sets: SetInstance[]
    notes: string
  }
  userId?: string
  /** Controlled by parent so it can auto-advance between exercises. */
  isExpanded: boolean
  onToggleExpand: () => void
  weightUnit: 'lbs' | 'kg'
}) {
  const inputKind = getExerciseInputKind(exerciseInstance.exercise)
  const isCardio = inputKind === 'cardio'
  const distanceUnit = distanceUnitFor(weightUnit)

  const [prWeight, setPrWeight] = useState<number | null>(null)
  useEffect(() => {
    // PRs are only meaningful for strength lifts.
    if (isCardio) return
    if (!userId || !exerciseInstance.exerciseId) return
    getBestLift(userId, exerciseInstance.exerciseId).then(record => {
      if (record) setPrWeight(record.weight)
    })
  }, [userId, exerciseInstance.exerciseId, isCardio])

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
        'rounded-2xl bg-card border overflow-hidden',
        allDone ? 'border-foreground/30' : 'border-border/40',
        isExpanded && 'shadow-card'
      )}
    >
      {/* Header — tap to toggle */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {allDone && (
            <span className="h-6 w-6 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
          <div className="min-w-0">
            <h4 className="font-semibold text-base text-foreground truncate">
              {exerciseInstance.exercise?.name || 'Exercise'}
            </h4>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {completedSets}/{totalSets} {setLabel}
              {muscles && ` · ${muscles}`}
              {prWeight && !isCardio && ` · PR ${prWeight} ${weightUnit}`}
            </p>
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

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border/30">
              {/* Column labels — cardio swaps Weight/Reps/RPE for Time/Distance/RPE */}
              <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem] gap-2 px-2 pb-2 pt-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                <span>{isCardio ? '#' : 'Set'}</span>
                <span>{isCardio ? 'Time (m)' : 'Weight'}</span>
                <span>{isCardio ? `Dist (${distanceUnit})` : 'Reps'}</span>
                <span>RPE</span>
                <span />
              </div>

              <div className="flex flex-col gap-1.5">
                {exerciseInstance.sets.map((set, idx) => (
                  <SetEditableRow
                    key={set.id}
                    set={set}
                    setNumber={idx + 1}
                    weightUnit={weightUnit}
                    isCardio={isCardio}
                    distanceUnit={distanceUnit}
                  />
                ))}
              </div>

              <button
                onClick={() => appendSetToExercise(exerciseInstance.id)}
                className="mt-3 w-full flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-dashed border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-secondary/30 transition-colors active:scale-[0.985]"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                {isCardio ? 'Add session' : 'Add set'}
              </button>

              {exerciseInstance.exercise?.cues && exerciseInstance.exercise.cues.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  💡 {exerciseInstance.exercise.cues.join(' · ')}
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
// Set Row — single tappable row with plain text inputs (no steppers)
// ============================================================================

function SetEditableRow({
  set,
  setNumber,
  weightUnit,
  isCardio = false,
  distanceUnit = 'mi',
}: {
  set: SetInstance
  setNumber: number
  weightUnit: 'lbs' | 'kg'
  isCardio?: boolean
  distanceUnit?: 'mi' | 'km'
}) {
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
    // Persist any in-flight typing first.
    if (isCardio) {
      await Promise.all([commitDuration(), commitDistance(), commitRpe()])
    } else {
      await Promise.all([commitWeight(), commitReps(), commitRpe()])
    }
    await db.setInstances.update(set.id, { completed: !set.completed })
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem] gap-2 items-center rounded-xl px-2 py-1.5 transition-colors',
        set.completed ? 'bg-foreground/10' : 'bg-secondary/30'
      )}
    >
      <span className={cn(
        'text-sm font-mono tabular-nums text-center',
        set.completed ? 'text-foreground/80' : 'text-muted-foreground'
      )}>
        {setNumber}
      </span>

      {isCardio ? (
        <>
          <CellInput
            value={durationText}
            onChange={setDurationText}
            onBlur={commitDuration}
            placeholder={set.targetDuration != null ? String(secondsToMinutes(set.targetDuration)) : '–'}
            ariaLabel={`Session ${setNumber} duration in minutes`}
            completed={set.completed}
            allowDecimal
          />
          <CellInput
            value={distanceText}
            onChange={setDistanceText}
            onBlur={commitDistance}
            placeholder={set.targetDistance != null ? String(set.targetDistance) : '–'}
            ariaLabel={`Session ${setNumber} distance in ${distanceUnit}`}
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
            ariaLabel={`Set ${setNumber} weight in ${weightUnit}`}
            completed={set.completed}
            allowDecimal
          />
          <CellInput
            value={repsText}
            onChange={setRepsText}
            onBlur={commitReps}
            placeholder={set.targetReps != null ? String(set.targetReps) : '–'}
            ariaLabel={`Set ${setNumber} reps`}
            completed={set.completed}
          />
        </>
      )}
      <CellInput
        value={rpeText}
        onChange={setRpeText}
        onBlur={commitRpe}
        placeholder={set.targetRPE != null ? String(set.targetRPE) : '–'}
        ariaLabel={`Set ${setNumber} RPE`}
        completed={set.completed}
      />

      <button
        onClick={toggleComplete}
        className={cn(
          'h-10 w-10 flex items-center justify-center rounded-lg transition-colors touch-target shrink-0',
          set.completed
            ? 'bg-foreground text-background'
            : 'bg-secondary/80 text-muted-foreground hover:text-foreground hover:bg-secondary'
        )}
        aria-label={set.completed ? 'Mark set incomplete' : 'Mark set complete'}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
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
        'h-10 w-full text-center rounded-lg bg-input border border-border/30 px-1 text-base font-semibold tabular-nums',
        'focus:outline-none focus:ring-2 focus:ring-foreground/30 focus:border-foreground/40 focus:bg-card',
        'placeholder:text-muted-foreground/40 transition-colors',
        completed ? 'text-foreground' : 'text-foreground'
      )}
    />
  )
}

// ============================================================================
// Reflection Form
// ============================================================================

function ReflectionForm({
  workoutId,
  workoutName,
  onComplete,
}: {
  workoutId: string
  workoutName: string
  onComplete: () => void
}) {
  const [overall, setOverall] = useState(7)
  const [energy, setEnergy] = useState(7)
  const [journal, setJournal] = useState('')
  const [win, setWin] = useState('')
  const [struggle, setStruggle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationData, setCelebrationData] = useState<{
    newStreak: number; totalWorkouts: number; newAchievements: AchievementId[]
  } | null>(null)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    const reflectionData: WorkoutReflection = {
      id: generateId(),
      workoutId,
      completedAt: new Date(),
      energy,
      performance: overall,
      sleepQuality: 7,
      sleepHours: 7,
      hydration: 7,
      nutrition: 7,
      stress: 5,
      motivation: 7,
      conditioningComfort: null,
      overallSatisfaction: overall,
      painNotes: '',
      winOfTheDay: win,
      struggleOfTheDay: struggle,
      freeformNotes: journal,
    }

    await db.workoutReflections.add(reflectionData)
    await db.workouts.update(workoutId, { status: 'completed', completedAt: new Date() })

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
    <div className="min-h-screen bg-background pb-32">
      <header className="px-5 pt-12 pb-6">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{dateLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Journal entry</h1>
        <p className="text-sm text-muted-foreground mt-1">{workoutName}</p>
      </header>

      <div className="px-5 space-y-6">
        {/* Overall feel — single dominant slider */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">How was it?</h2>
            <span className="text-3xl font-bold tabular-nums">{overall}<span className="text-base text-muted-foreground font-normal">/10</span></span>
          </div>
          <Slider value={overall} onChange={setOverall} />
        </section>

        {/* Energy */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Energy level</h2>
            <span className="text-3xl font-bold tabular-nums">{energy}<span className="text-base text-muted-foreground font-normal">/10</span></span>
          </div>
          <Slider value={energy} onChange={setEnergy} />
        </section>

        {/* Journal — the main entry */}
        <section>
          <h2 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-3">Notes</h2>
          <textarea
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
            placeholder="How did the session feel? What worked, what didn't?"
            rows={5}
            className="w-full rounded-2xl bg-card border border-border/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/30 focus:border-foreground/40 transition-colors resize-none"
          />
        </section>

        <section className="space-y-3">
          <Input
            label="Win of the day"
            placeholder="The best thing about today's session"
            value={win}
            onChange={e => setWin(e.target.value)}
          />
          <Input
            label="Challenge"
            placeholder="What was hardest?"
            value={struggle}
            onChange={e => setStruggle(e.target.value)}
          />
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border/40 safe-area-bottom">
        <div className="max-w-lg mx-auto px-5 py-3 flex gap-2">
          <Button
            variant="ghost"
            onClick={async () => {
              // Skip means: still mark the workout completed, just no journal entry.
              await db.workouts.update(workoutId, { status: 'completed', completedAt: new Date() })
              const u = await getCurrentUser()
              if (u) await updateStreakOnWorkoutComplete(u.id)
              onComplete()
            }}
            className="flex-1"
          >
            Skip
          </Button>
          <Button onClick={handleSubmit} loading={isSubmitting} className="flex-[2]">
            Save & finish
          </Button>
        </div>
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
    <div className="min-h-screen bg-background flex flex-col safe-area-inset">
      <main className="flex-1 flex flex-col items-center justify-center px-6 max-w-md mx-auto w-full text-center">
        {/* Hero — checkmark glyph, scales in */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
          className="h-20 w-20 rounded-full bg-foreground text-background flex items-center justify-center mb-6"
        >
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
        </motion.div>

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
          <div className="rounded-2xl bg-card border border-border/40 p-4 text-left">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Streak</p>
            <p className="text-3xl font-bold tabular-nums mt-1">{streak}<span className="text-sm text-muted-foreground font-normal ml-1">days</span></p>
          </div>
          <div className="rounded-2xl bg-card border border-border/40 p-4 text-left">
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
                  <div key={id} className="rounded-xl border border-border/40 bg-card p-3 flex items-center gap-3 text-left">
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
    <div className="min-h-screen bg-background pb-8">
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
              <div className="flex-1 rounded-2xl bg-card border border-border/40 p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sets</p>
                <p className="text-2xl font-bold tabular-nums mt-1">{totalSets}</p>
              </div>
            )}
            {workout.totalDuration && workout.totalDuration > 0 && (
              <div className="flex-1 rounded-2xl bg-card border border-border/40 p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Time</p>
                <p className="text-2xl font-bold tabular-nums mt-1">{workout.totalDuration}<span className="text-sm text-muted-foreground font-normal ml-1">min</span></p>
              </div>
            )}
            <div className="flex-1 rounded-2xl bg-card border border-border/40 p-4">
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


function getBlockInstructions(blockType: BlockType): string {
  switch (blockType) {
    case 'warmup': return 'Complete your warmup: foam rolling, dynamic stretches, and movement prep.'
    case 'cooldown': return 'Cool down with static stretching and breathing. Take your time.'
    default: return 'Complete the exercises in this block, then tap complete.'
  }
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
