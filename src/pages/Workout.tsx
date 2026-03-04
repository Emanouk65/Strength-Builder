import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  getWorkoutWithDetails,
  getCurrentUser,
  updateStreakOnWorkoutComplete,
  checkTimeBasedAchievements,
  checkIronWillAchievement,
  getBestLift,
} from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input, Slider } from '@/components/ui'
import { cn, getRPEColor, generateId } from '@/lib/utils'
import { BLOCK_CONFIG, RPE_DESCRIPTIONS, ACHIEVEMENTS, getStreakMessage } from '@/lib/constants'
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

  useEffect(() => {
    if (workoutData && workoutData.status === 'planned') {
      db.workouts.update(workoutData.id, { status: 'in_progress' })
    }
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
        onComplete={() => navigate(`/check-in?workoutId=${workoutData.id}&returnTo=/`)}
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
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="text-center">
            <p className="text-xs font-semibold text-muted-foreground">{workoutData.name}</p>
            <p className="text-sm font-bold">
              Block {currentBlockIndex + 1} / {totalBlocks}
            </p>
          </div>

          {/* Set counter */}
          <div className="flex items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-full">
            <span className="text-sm font-black text-primary">{totalSetsCompleted}</span>
            <span className="text-xs text-muted-foreground">/{totalSets}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              progress === 100 ? 'bg-success' : 'bg-gradient-to-r from-primary to-[#7209B7]'
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

          {/* Exercises */}
          <div className="p-4">
            {currentBlock.exercises.length > 0 ? (
              <div className="space-y-5">
                {currentBlock.exercises.map((exerciseInstance, index) => (
                  <ExerciseBlock
                    key={exerciseInstance.id}
                    exerciseInstance={exerciseInstance}
                    isLast={index === currentBlock.exercises.length - 1}
                    userId={workoutData.userId}
                  />
                ))}
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
              ? 'bg-gradient-to-r from-success to-[#00A844] shadow-glow-success text-white border-0'
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

      {/* Celebration toast */}
      {celebrationMessage && (
        <div className="absolute top-0 right-0 animate-slide-up z-10">
          <span className="text-sm font-black text-success bg-success/15 border border-success/30 px-3 py-1 rounded-full">
            {celebrationMessage}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {exerciseInstance.sets.map((set, index) => (
          <WorkoutSetRow
            key={set.id}
            set={set}
            setNumber={index + 1}
            isExpanded={expandedSet === index}
            onExpand={() => setExpandedSet(expandedSet === index ? null : index)}
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
  onComplete,
  justCompleted = false,
  prWeight,
}: {
  set: SetInstance
  setNumber: number
  isExpanded: boolean
  onExpand: () => void
  onComplete: (data: Partial<SetInstance>) => void
  justCompleted?: boolean
  prWeight?: number | null
}) {
  const [weight, setWeight] = useState(set.actualWeight ?? set.targetWeight ?? 0)
  const [reps, setReps] = useState(set.actualReps ?? set.targetReps ?? 0)
  const [rpe, setRpe] = useState(set.actualRPE ?? set.targetRPE ?? 7)

  const isPRWeight = prWeight && weight > prWeight

  if (set.completed) {
    return (
      <div
        className={cn(
          'flex items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-300',
          justCompleted
            ? 'bg-success/15 border border-success/30 animate-set-complete'
            : 'bg-secondary/40 border border-transparent'
        )}
      >
        <span className="text-sm font-mono text-muted-foreground">Set {setNumber}</span>
        <div className="flex items-center gap-3 text-sm">
          <span className={cn('font-bold', justCompleted && 'text-success')}>{set.actualWeight} lbs</span>
          <span className={cn('font-bold', justCompleted && 'text-success')}>× {set.actualReps}</span>
          <span className={cn('text-xs font-mono', getRPEColor(set.actualRPE || 0))}>
            @{set.actualRPE}
          </span>
          <div className={cn(
            'w-6 h-6 rounded-lg flex items-center justify-center',
            justCompleted ? 'bg-success text-white animate-bounce-in' : 'text-success'
          )}>
            {justCompleted ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline className="animate-checkmark" points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!isExpanded) {
    return (
      <button
        onClick={onExpand}
        className="w-full flex items-center justify-between rounded-xl bg-secondary/50 border border-border/60 px-3 py-2.5 text-left hover:border-primary/50 hover:bg-secondary/70 transition-all duration-150 active:scale-[0.98]"
      >
        <span className="text-sm font-bold text-foreground">Set {setNumber}</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-foreground/80">{set.targetWeight} lbs</span>
          <span className="text-foreground/60">× {set.targetReps}</span>
          <span className={cn('text-xs font-semibold', getRPEColor(set.targetRPE ?? 7))}>@{set.targetRPE}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-muted-foreground">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-primary/40 bg-card shadow-sm animate-slide-up overflow-hidden">
      {/* Header row with target hint */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border/30">
        <span className="text-xs font-black text-foreground uppercase tracking-wide">Set {setNumber}</span>
        {(set.targetWeight || set.targetReps) ? (
          <span className="text-[10px] font-semibold text-muted-foreground bg-secondary/70 px-2 py-1 rounded-lg">
            Target: {set.targetWeight} lbs × {set.targetReps} @{set.targetRPE}
          </span>
        ) : null}
      </div>

      {isPRWeight && (
        <div className="bg-accent-orange/15 border-b border-accent-orange/30 px-3 py-2 text-center">
          <p className="text-xs font-black text-accent-orange animate-pr-flash">🏆 NEW PR WEIGHT — Beat Your Record!</p>
        </div>
      )}

      {/* Single input row: Weight | × Reps | @ RPE | ✓ Done */}
      <div className="flex items-center gap-2 px-3 py-3">
        {/* Weight */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Input
            type="number"
            value={weight}
            onChange={e => setWeight(Number(e.target.value))}
            className="text-center font-black text-base h-11 px-1 min-w-0"
          />
          <span className="text-[10px] font-semibold text-muted-foreground shrink-0">lbs</span>
        </div>

        <span className="text-muted-foreground font-bold text-sm shrink-0">×</span>

        {/* Reps */}
        <div className="flex-1 min-w-0">
          <Input
            type="number"
            value={reps}
            onChange={e => setReps(Number(e.target.value))}
            className="text-center font-black text-base h-11 px-1 min-w-0 w-full"
          />
        </div>

        <span className="text-muted-foreground font-bold text-sm shrink-0">@</span>

        {/* RPE */}
        <div className="w-14 shrink-0">
          <Input
            type="number"
            min={1}
            max={10}
            value={rpe}
            onChange={e => setRpe(Number(e.target.value))}
            className={cn('text-center font-black text-base h-11 px-1', getRPEColor(rpe))}
          />
        </div>

        {/* Done checkmark button */}
        <button
          onClick={() => onComplete({ actualWeight: weight, actualReps: reps, actualRPE: rpe })}
          className="w-11 h-11 rounded-xl bg-success flex items-center justify-center text-white shrink-0 shadow-glow-success active:scale-90 transition-transform"
          aria-label="Log set"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>

      {/* RPE label + cancel */}
      <div className="flex items-center justify-between px-3 pb-3">
        <p className="text-[10px] font-semibold text-muted-foreground">{RPE_DESCRIPTIONS[rpe]}</p>
        <button onClick={onExpand} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1">
          Cancel
        </button>
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
  onComplete,
}: {
  workoutId: string
  workoutName: string
  onComplete: () => void
}) {
  const [reflection, setReflection] = useState({
    energy: 7, performance: 7, sleepQuality: 7, sleepHours: 7,
    hydration: 7, nutrition: 7, stress: 5, motivation: 7,
    overallSatisfaction: 7, winOfTheDay: '', struggleOfTheDay: '',
    freeformNotes: '', painNotes: '',
  })
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
      energy: reflection.energy,
      performance: reflection.performance,
      sleepQuality: reflection.sleepQuality,
      sleepHours: reflection.sleepHours,
      hydration: reflection.hydration,
      nutrition: reflection.nutrition,
      stress: reflection.stress,
      motivation: reflection.motivation,
      conditioningComfort: null,
      overallSatisfaction: reflection.overallSatisfaction,
      painNotes: reflection.painNotes,
      winOfTheDay: reflection.winOfTheDay,
      struggleOfTheDay: reflection.struggleOfTheDay,
      freeformNotes: reflection.freeformNotes,
    }

    await db.workoutReflections.add(reflectionData)
    await db.workouts.update(workoutId, { status: 'completed', completedAt: new Date() })

    const user = await getCurrentUser()
    if (user) {
      const streakAchievements = await updateStreakOnWorkoutComplete(user.id)
      const timeAchievements = await checkTimeBasedAchievements(user.id)
      const ironWillUnlocked = await checkIronWillAchievement(user.id, reflection.energy)
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

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      <header className="mb-6">
        <h1 className="text-2xl font-black">Post-Workout Reflection</h1>
        <p className="text-sm text-muted-foreground mt-1">Be honest — this data drives your programming.</p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">How Are You Feeling?</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Slider label="Energy Level" value={reflection.energy} onChange={v => setReflection(r => ({ ...r, energy: v }))} />
            <Slider label="Performance" value={reflection.performance} onChange={v => setReflection(r => ({ ...r, performance: v }))} />
            <Slider label="Overall Satisfaction" value={reflection.overallSatisfaction} onChange={v => setReflection(r => ({ ...r, overallSatisfaction: v }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recovery Factors</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Slider label="Sleep Quality" value={reflection.sleepQuality} onChange={v => setReflection(r => ({ ...r, sleepQuality: v }))} />
            <Slider label="Sleep Hours" min={4} max={10} value={reflection.sleepHours} onChange={v => setReflection(r => ({ ...r, sleepHours: v }))} valueFormatter={v => `${v}h`} />
            <Slider label="Hydration" value={reflection.hydration} onChange={v => setReflection(r => ({ ...r, hydration: v }))} />
            <Slider label="Nutrition" value={reflection.nutrition} onChange={v => setReflection(r => ({ ...r, nutrition: v }))} />
            <Slider label="Stress Level" value={reflection.stress} onChange={v => setReflection(r => ({ ...r, stress: v }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Session Notes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input label="Win of the Day" placeholder="What went well?" value={reflection.winOfTheDay} onChange={e => setReflection(r => ({ ...r, winOfTheDay: e.target.value }))} />
            <Input label="Challenge" placeholder="What was hard?" value={reflection.struggleOfTheDay} onChange={e => setReflection(r => ({ ...r, struggleOfTheDay: e.target.value }))} />
            <Input label="Pain Notes" placeholder="Any discomfort? Where?" value={reflection.painNotes} onChange={e => setReflection(r => ({ ...r, painNotes: e.target.value }))} />
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={handleSubmit} loading={isSubmitting}>
          Complete Workout
        </Button>
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
  const [showAchievements, setShowAchievements] = useState(false)
  useEffect(() => {
    if (newAchievements.length > 0) {
      const t = setTimeout(() => setShowAchievements(true), 800)
      return () => clearTimeout(t)
    }
  }, [newAchievements])

  const isOnFire = streak >= 3

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-6 animate-float">
        <span className="text-7xl">{isOnFire ? '🔥' : '✓'}</span>
      </div>
      <h1 className="text-4xl font-black tracking-tight mb-1">FORGED</h1>
      <p className="text-muted-foreground mb-8">{workoutName} complete</p>

      <div className={cn(
        'w-full max-w-sm mb-6 rounded-2xl border p-6',
        isOnFire ? 'border-primary/40 bg-gradient-to-br from-primary/10 to-transparent shadow-glow' : 'border-border/50 bg-card'
      )}>
        <div className={cn('text-6xl font-black font-mono', isOnFire ? 'text-primary' : 'text-foreground')}>
          {streak}
        </div>
        <p className="text-sm text-muted-foreground mt-1">day streak</p>
        <p className="text-sm text-muted-foreground mt-3">{getStreakMessage(streak)}</p>
      </div>

      <div className="flex gap-8 mb-8">
        <div className="text-center">
          <p className="text-2xl font-black font-mono">{totalWorkouts}</p>
          <p className="text-xs text-muted-foreground">total workouts</p>
        </div>
      </div>

      {newAchievements.length > 0 && showAchievements && (
        <div className="w-full max-w-sm mb-8 animate-bounce-in">
          <p className="text-xs font-bold text-primary uppercase tracking-widest mb-3">
            🏅 Achievement{newAchievements.length > 1 ? 's' : ''} Unlocked!
          </p>
          <div className="space-y-2">
            {newAchievements.map(id => {
              const a = ACHIEVEMENTS[id]
              if (!a) return null
              return (
                <div key={id} className="rounded-2xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
                  <span className="text-3xl">{a.icon}</span>
                  <div className="text-left">
                    <p className="font-bold text-sm">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground italic mb-8 max-w-xs">{getMotivationalQuote()}</p>
      <Button size="lg" onClick={onContinue} className="w-full max-w-sm">Continue</Button>
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
    reflection?: { energy: number; performance: number; winOfTheDay: string } | null
  }
  onBack: () => void
}) {
  const completedDate = workout.completedAt ? new Date(workout.completedAt) : null

  const quickLogEntries = useLiveQuery(
    async () => {
      if (workout.workoutType !== 'quick_log') return null
      return db.quickLogEntries.where('workoutId').equals(workout.id).sortBy('order')
    },
    [workout.id, workout.workoutType]
  )

  const hasBlockExercises = workout.blocks.some(block =>
    block.exercises.some(ex => ex.sets.some(s => s.completed))
  )

  const totalSets =
    workout.blocks.reduce(
      (acc, block) => acc + block.exercises.reduce((s, ex) => s + ex.sets.filter(s => s.completed).length, 0),
      0
    ) +
    (quickLogEntries?.reduce(
      (acc, entry) => acc + entry.sets.filter(s => s.completed || (s.weight != null && s.reps != null)).length,
      0
    ) || 0)

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      <header className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="text-center flex-1">
          <h1 className="text-xl font-black">{workout.name}</h1>
          <Badge variant="success" className="mt-1 text-xs">Completed</Badge>
        </div>
        <div className="w-9" />
      </header>

      {completedDate && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="font-bold text-sm mt-0.5">
                  {completedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {completedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              {totalSets > 0 && (
                <div className="text-right">
                  <p className="text-3xl font-black text-primary">{totalSets}</p>
                  <p className="text-xs text-muted-foreground">sets</p>
                  {workout.totalDuration && workout.totalDuration > 0 && (
                    <p className="text-xs text-muted-foreground">{workout.totalDuration} min</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {workout.reflection && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Session Reflection</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Energy</p>
                <p className="text-2xl font-black">{workout.reflection.energy}<span className="text-sm font-normal text-muted-foreground">/10</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Performance</p>
                <p className="text-2xl font-black">{workout.reflection.performance}<span className="text-sm font-normal text-muted-foreground">/10</span></p>
              </div>
            </div>
            {workout.reflection.winOfTheDay && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <p className="text-xs text-muted-foreground">Win of the Day</p>
                <p className="text-sm mt-1">"{workout.reflection.winOfTheDay}"</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasBlockExercises && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Exercises</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {workout.blocks.map(block =>
                block.exercises.map(exerciseInstance => {
                  const completedSets = exerciseInstance.sets.filter(s => s.completed)
                  if (completedSets.length === 0) return null
                  return (
                    <div key={exerciseInstance.id} className="mb-4 last:mb-0">
                      <h4 className="font-bold text-sm mb-2">{exerciseInstance.exercise?.name || 'Exercise'}</h4>
                      <div className="space-y-1">
                        {completedSets.map((set, index) => (
                          <div key={set.id} className="flex items-center justify-between text-sm bg-secondary/40 rounded-xl px-3 py-2">
                            <span className="text-xs text-muted-foreground font-mono">Set {index + 1}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-bold">{set.actualWeight || set.targetWeight} lbs</span>
                              <span className="text-muted-foreground">× {set.actualReps || set.targetReps}</span>
                              {(set.actualRPE || set.targetRPE) && (
                                <span className={cn('text-xs font-mono', getRPEColor(set.actualRPE || set.targetRPE || 0))}>
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
          </CardContent>
        </Card>
      )}

      {quickLogEntries && quickLogEntries.length > 0 && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Exercises</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {quickLogEntries.map(entry => {
                const loggedSets = entry.sets.filter(s => s.completed || (s.weight != null && s.reps != null))
                if (loggedSets.length === 0) return null
                return (
                  <div key={entry.id} className="mb-4 last:mb-0">
                    <h4 className="font-bold text-sm mb-2">{entry.exerciseName}</h4>
                    <div className="space-y-1">
                      {loggedSets.map((set, index) => (
                        <div key={index} className="flex items-center justify-between text-sm bg-secondary/40 rounded-xl px-3 py-2">
                          <span className="text-xs text-muted-foreground font-mono">Set {index + 1}</span>
                          <div className="flex items-center gap-3">
                            {set.weight && <span className="font-bold">{set.weight} lbs</span>}
                            {set.reps && <span className="text-muted-foreground">× {set.reps}</span>}
                            {set.duration && <span>{set.duration}s</span>}
                            {set.rpe && <span className={cn('text-xs font-mono', getRPEColor(set.rpe))}>@{set.rpe}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {entry.notes && <p className="text-xs text-muted-foreground mt-2 italic">{entry.notes}</p>}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!hasBlockExercises && (!quickLogEntries || quickLogEntries.length === 0) && (
        <Card className="mb-4">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">No exercise data recorded</p>
          </CardContent>
        </Card>
      )}

      <Button variant="outline" className="w-full mt-4" onClick={onBack}>Back to History</Button>
    </div>
  )
}

function getMotivationalQuote(): string {
  const quotes = [
    "Every rep shapes who you become.",
    "The iron never lies.",
    "Discipline is choosing what you want most over what you want now.",
    "Progress, not perfection.",
    "Trust the process.",
    "Champions are made when no one is watching.",
  ]
  return quotes[Math.floor(Math.random() * quotes.length)]
}

function getBlockInstructions(blockType: BlockType): string {
  switch (blockType) {
    case 'warmup': return 'Complete your warmup: foam rolling, dynamic stretches, and movement prep.'
    case 'cooldown': return 'Cool down with static stretching and breathing. Take your time.'
    default: return 'Complete the exercises in this block, then tap complete.'
  }
}
