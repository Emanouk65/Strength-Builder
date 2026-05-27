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
} from '@/db'
import { Button, Badge, Input, Slider, NumberStepper } from '@/components/ui'
import { cn, generateId } from '@/lib/utils'
import { BLOCK_CONFIG, RPE_DESCRIPTIONS, ACHIEVEMENTS } from '@/lib/constants'
import type { BlockType, SetInstance, WorkoutReflection, AchievementId } from '@/lib/types'

const SET_COMPLETE_MESSAGES = [
  "Nice lift!", "Crushed it!", "Strong!", "Let's go!", "Beast mode!",
  "Solid set!", "That's how it's done!", "Keep pushing!", "On fire!", "Locked in!",
]

function getEncouragingMessage() {
  return SET_COMPLETE_MESSAGES[Math.floor(Math.random() * SET_COMPLETE_MESSAGES.length)]
}

export function Workout() {
  const { workoutId } = useParams()
  const navigate = useNavigate()
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [showReflection, setShowReflection] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const workoutData = useLiveQuery(
    async () => { if (!workoutId) return null; return getWorkoutWithDetails(workoutId) },
    [workoutId]
  )

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
    return <WorkoutSummary workout={workoutData} onBack={() => navigate('/history')} />
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
              <div className="space-y-5">
                {groupExercisesBySuperset(currentBlock.exercises).map((g, gi, all) => {
                  const isLastGroup = gi === all.length - 1
                  if (g.kind === 'solo') {
                    return (
                      <ExerciseBlock
                        key={g.instance.id}
                        exerciseInstance={g.instance}
                        isLast={isLastGroup}
                        userId={workoutData.userId}
                      />
                    )
                  }
                  return (
                    <div key={g.groupId} className="rounded-2xl bg-foreground/[0.03] border border-foreground/15 p-3">
                      <div className="flex items-center gap-2 px-1 pb-2">
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-foreground/70">
                          Superset · {g.members.length} exercises
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Alternate sets between exercises
                        </span>
                      </div>
                      <div className="space-y-5">
                        {g.members.map((m, mi) => (
                          <ExerciseBlock
                            key={m.id}
                            exerciseInstance={m}
                            isLast={mi === g.members.length - 1}
                            userId={workoutData.userId}
                          />
                        ))}
                      </div>
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
// Exercise Block
// ============================================================================

function ExerciseBlock({
  exerciseInstance,
  isLast,
  userId,
}: {
  exerciseInstance: {
    id: string
    exerciseId: string
    exercise?: { name: string; cues: string[] }
    sets: SetInstance[]
    notes: string
  }
  isLast: boolean
  userId?: string
}) {
  const [expandedSet, setExpandedSet] = useState<number | null>(0)
  const [celebratingSet, setCelebratingSet] = useState<number | null>(null)
  const [celebrationMessage, setCelebrationMessage] = useState('')

  // Fetch PR for this exercise
  const [prWeight, setPrWeight] = useState<number | null>(null)
  useEffect(() => {
    if (!userId || !exerciseInstance.exerciseId) return
    getBestLift(userId, exerciseInstance.exerciseId).then(record => {
      if (record) setPrWeight(record.weight)
    })
  }, [userId, exerciseInstance.exerciseId])

  const completedSets = exerciseInstance.sets.filter(s => s.completed).length
  const totalSets = exerciseInstance.sets.length
  const allSetsComplete = completedSets === totalSets && totalSets > 0

  const handleSetComplete = async (set: SetInstance, data: Partial<SetInstance>) => {
    const currentIndex = exerciseInstance.sets.findIndex(s => s.id === set.id)
    setCelebratingSet(currentIndex)
    setCelebrationMessage(getEncouragingMessage())

    await db.setInstances.update(set.id, { ...data, completed: true })

    setTimeout(() => { setCelebratingSet(null); setCelebrationMessage('') }, 1500)

    if (currentIndex < exerciseInstance.sets.length - 1) {
      setExpandedSet(currentIndex + 1)
    } else {
      setExpandedSet(null)
    }
  }

  return (
    <div className={cn('relative', !isLast && 'pb-5 border-b border-border/30')}>
      {/* Exercise header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h4 className="font-bold text-base truncate">{exerciseInstance.exercise?.name || 'Exercise'}</h4>
          {allSetsComplete && <span className="text-success animate-bounce-in text-lg flex-shrink-0">✓</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Set progress dots */}
          <div className="flex gap-1">
            {exerciseInstance.sets.map((set, i) => (
              <div
                key={i}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  set.completed ? 'bg-success scale-110' : 'bg-secondary',
                  celebratingSet === i && 'animate-pulse-success'
                )}
              />
            ))}
          </div>
          <span className="text-xs font-mono text-muted-foreground">{completedSets}/{totalSets}</span>
        </div>
      </div>

      {/* PR indicator */}
      {prWeight && (
        <p className="text-xs text-accent-orange mb-2 font-semibold">
          🏆 PR: {prWeight} lbs
        </p>
      )}

      {/* Celebration toast — floats from bottom, away from exercise name */}
      <AnimatePresence>
        {celebrationMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="fixed bottom-24 inset-x-0 z-30 flex justify-center pointer-events-none"
          >
            <span className="text-sm font-semibold text-background bg-foreground px-4 py-2 rounded-full shadow-card">
              {celebrationMessage}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {exerciseInstance.sets.map((set, index) => (
          <WorkoutSetRow
            key={set.id}
            set={set}
            setNumber={index + 1}
            isExpanded={expandedSet === index}
            onExpand={() => setExpandedSet(expandedSet === index ? null : index)}
            onPatch={async (patch) => { await db.setInstances.update(set.id, patch) }}
            onComplete={data => handleSetComplete(set, data)}
            justCompleted={celebratingSet === index}
            prWeight={prWeight}
          />
        ))}
      </div>

      {exerciseInstance.exercise?.cues && exerciseInstance.exercise.cues.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          💡 {exerciseInstance.exercise.cues.join(' · ')}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Workout Set Row
// ============================================================================

function WorkoutSetRow({
  set,
  setNumber,
  isExpanded,
  onExpand,
  onPatch,
  onComplete,
  justCompleted = false,
  prWeight,
}: {
  set: SetInstance
  setNumber: number
  isExpanded: boolean
  onExpand: () => void
  /** Partial autosave — writes a field without marking the set complete. */
  onPatch: (patch: Partial<SetInstance>) => void | Promise<void>
  onComplete: (data: Partial<SetInstance>) => void
  justCompleted?: boolean
  prWeight?: number | null
}) {
  // Display values fall back through actual → target → empty.
  const weight = set.actualWeight ?? set.targetWeight
  const reps = set.actualReps ?? set.targetReps
  const rpe = set.actualRPE ?? set.targetRPE

  const isPRWeight = prWeight != null && weight != null && weight > prWeight

  if (set.completed) {
    return (
      <div
        className={cn(
          'flex items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-300',
          justCompleted
            ? 'bg-foreground/10 border border-foreground/25 animate-set-complete'
            : 'bg-secondary/40 border border-transparent'
        )}
      >
        <span className="text-sm font-mono text-muted-foreground">Set {setNumber}</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-foreground">{set.actualWeight ?? '—'} lbs</span>
          <span className="text-foreground/70">× {set.actualReps ?? '—'}</span>
          {set.actualRPE != null && (
            <span className="text-xs font-mono text-muted-foreground">@{set.actualRPE}</span>
          )}
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-foreground">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  if (!isExpanded) {
    return (
      <button
        onClick={onExpand}
        className="w-full flex items-center justify-between rounded-xl bg-secondary/50 border border-border/60 px-3 py-2.5 text-left hover:border-foreground/30 hover:bg-secondary/70 transition-all duration-150 active:scale-[0.98]"
      >
        <span className="text-sm font-bold text-foreground">Set {setNumber}</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-foreground/80">{weight ?? '—'} lbs</span>
          <span className="text-foreground/60">× {reps ?? '—'}</span>
          {rpe != null && (
            <span className="text-xs font-semibold text-muted-foreground">@{rpe}</span>
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-muted-foreground">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-foreground/25 bg-card shadow-card animate-slide-up overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/30">
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Set {setNumber}</span>
        {(set.targetWeight || set.targetReps) ? (
          <span className="text-[10px] font-mono text-muted-foreground">
            Target {set.targetWeight ?? '—'} × {set.targetReps ?? '—'}{set.targetRPE != null && ` @${set.targetRPE}`}
          </span>
        ) : null}
      </div>

      {isPRWeight && (
        <div className="bg-foreground/10 border-b border-foreground/20 px-3 py-2 text-center">
          <p className="text-xs font-bold text-foreground">🏆 NEW PR WEIGHT</p>
        </div>
      )}

      {/* Three labeled controls — auto-save on each change */}
      <div className="px-4 py-4 grid grid-cols-3 gap-3">
        <SetField label="Weight" suffix="lbs">
          <NumberStepper
            value={weight ?? null}
            onChange={(v) => onPatch({ actualWeight: v })}
            min={0}
            max={2000}
            step={5}
            integer={false}
            size="md"
            ariaLabel="weight"
          />
        </SetField>
        <SetField label="Reps">
          <NumberStepper
            value={reps ?? null}
            onChange={(v) => onPatch({ actualReps: v })}
            min={0}
            max={500}
            size="md"
            ariaLabel="reps"
          />
        </SetField>
        <SetField label="RPE">
          <NumberStepper
            value={rpe ?? null}
            onChange={(v) => onPatch({ actualRPE: v })}
            min={1}
            max={10}
            size="md"
            ariaLabel="rpe"
          />
        </SetField>
      </div>

      {/* RPE description + Done */}
      <div className="flex items-center justify-between px-4 pb-3 gap-3">
        <p className="text-[10px] font-medium text-muted-foreground flex-1 truncate">
          {rpe != null ? RPE_DESCRIPTIONS[rpe] : 'Set values auto-save'}
        </p>
        <button
          onClick={onExpand}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          Close
        </button>
        <Button
          size="sm"
          onClick={() => onComplete({
            actualWeight: weight ?? set.targetWeight ?? null,
            actualReps: reps ?? set.targetReps ?? null,
            actualRPE: rpe ?? set.targetRPE ?? null,
          })}
        >
          ✓ Done
        </Button>
      </div>
    </div>
  )
}

function SetField({ label, suffix, children }: { label: string; suffix?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}{suffix && <span className="ml-1 normal-case tracking-normal text-muted-foreground/70">{suffix}</span>}
      </span>
      {children}
    </div>
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
        exercise?: { name: string }
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
}) {
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
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Journal</p>
              <div className="flex gap-4 text-right">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Felt</p>
                  <p className="text-sm font-bold tabular-nums">{workout.reflection.overallSatisfaction}/10</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Energy</p>
                  <p className="text-sm font-bold tabular-nums">{workout.reflection.energy}/10</p>
                </div>
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
                  return (
                    <div key={exerciseInstance.id}>
                      <h4 className="font-semibold text-sm mb-2 truncate">{exerciseInstance.exercise?.name || 'Exercise'}</h4>
                      <div className="space-y-1">
                        {completedSets.map((set, index) => (
                          <div key={set.id} className="flex items-center justify-between text-sm bg-secondary/40 rounded-xl px-3 py-2">
                            <span className="text-xs text-muted-foreground font-mono">Set {index + 1}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold">{set.actualWeight ?? set.targetWeight ?? '—'} lbs</span>
                              <span className="text-muted-foreground">× {set.actualReps ?? set.targetReps ?? '—'}</span>
                              {(set.actualRPE || set.targetRPE) && (
                                <span className={cn('text-xs font-mono text-muted-foreground')}>
                                  @{set.actualRPE || set.targetRPE}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
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
