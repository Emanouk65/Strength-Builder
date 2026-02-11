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
} from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input, Slider, Progress } from '@/components/ui'
import { cn, getRPEColor, generateId } from '@/lib/utils'
import { BLOCK_CONFIG, RPE_DESCRIPTIONS, ACHIEVEMENTS, getStreakMessage } from '@/lib/constants'
import type { BlockType, SetInstance, WorkoutReflection, AchievementId } from '@/lib/types'

// Encouraging messages for set completion
const SET_COMPLETE_MESSAGES = [
  "Nice lift!",
  "Crushed it!",
  "Strong!",
  "Let's go!",
  "Beast mode!",
  "Solid set!",
  "That's how it's done!",
  "Keep pushing!",
  "On fire!",
  "Locked in!",
]

// Get random encouraging message
function getEncouragingMessage(): string {
  return SET_COMPLETE_MESSAGES[Math.floor(Math.random() * SET_COMPLETE_MESSAGES.length)]
}

export function Workout() {
  const { workoutId } = useParams()
  const navigate = useNavigate()
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [showReflection, setShowReflection] = useState(false)

  const workoutData = useLiveQuery(
    async () => {
      if (!workoutId) return null
      return getWorkoutWithDetails(workoutId)
    },
    [workoutId]
  )

  // Mark workout as in_progress when starting
  useEffect(() => {
    if (workoutData && workoutData.status === 'planned') {
      db.workouts.update(workoutData.id, { status: 'in_progress' })
    }
  }, [workoutData])

  if (!workoutId) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-8">
            <p className="text-muted-foreground mb-4">No workout selected</p>
            <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!workoutData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (showReflection) {
    return (
      <ReflectionForm
        workoutId={workoutData.id}
        workoutName={workoutData.name}
        onComplete={() => navigate('/')}
      />
    )
  }

  // Show summary view for completed workouts
  if (workoutData.status === 'completed') {
    return (
      <WorkoutSummary
        workout={workoutData}
        onBack={() => navigate('/history')}
      />
    )
  }

  const currentBlock = workoutData.blocks[currentBlockIndex]

  // Handle case where there are no blocks
  if (!currentBlock) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-8">
            <p className="text-muted-foreground mb-4">This workout has no exercises configured</p>
            <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  const totalBlocks = workoutData.blocks.length
  const completedBlocks = workoutData.blocks.filter(b => b.completed).length
  const progress = (completedBlocks / totalBlocks) * 100

  // Calculate total sets completed across all blocks
  const totalSetsCompleted = workoutData.blocks.reduce((acc, block) => {
    return acc + block.exercises.reduce((setAcc, ex) => {
      return setAcc + ex.sets.filter(s => s.completed).length
    }, 0)
  }, 0)

  const totalSets = workoutData.blocks.reduce((acc, block) => {
    return acc + block.exercises.reduce((setAcc, ex) => {
      return setAcc + ex.sets.length
    }, 0)
  }, 0)

  // Check if current block is fully completed
  const currentBlockSetsCompleted = currentBlock.exercises.reduce((acc, ex) => {
    return acc + ex.sets.filter(s => s.completed).length
  }, 0)
  const currentBlockTotalSets = currentBlock.exercises.reduce((acc, ex) => {
    return acc + ex.sets.length
  }, 0)
  const isCurrentBlockComplete = currentBlockSetsCompleted === currentBlockTotalSets && currentBlockTotalSets > 0

  const handleBlockComplete = async () => {
    await db.workoutBlocks.update(currentBlock.id, { completed: true })

    if (currentBlockIndex < totalBlocks - 1) {
      setCurrentBlockIndex(currentBlockIndex + 1)
    } else {
      // All blocks complete, show reflection
      setShowReflection(true)
    }
  }

  const handleExit = () => {
    if (confirm('Exit workout? Your progress is saved.')) {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <button
          onClick={handleExit}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">{workoutData.name}</p>
          <p className="text-sm font-medium">
            Block {currentBlockIndex + 1} of {totalBlocks}
          </p>
        </div>
        {/* Sets counter badge */}
        <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full">
          <span className="text-xs font-bold text-primary">{totalSetsCompleted}</span>
          <span className="text-xs text-muted-foreground">/ {totalSets}</span>
        </div>
      </header>

      {/* Progress bar with shimmer effect when in progress */}
      <div className="relative mb-6">
        <Progress value={progress} className={cn(totalSetsCompleted > 0 && totalSetsCompleted < totalSets && 'animate-glow')} />
        {totalSetsCompleted > 0 && totalSetsCompleted < totalSets && (
          <div className="absolute inset-0 progress-shimmer rounded-full pointer-events-none" />
        )}
      </div>

      {/* Motivational stat bar */}
      {totalSetsCompleted > 0 && (
        <div className="flex items-center justify-center gap-2 mb-4 animate-slide-up">
          <span className="text-2xl">💪</span>
          <span className="text-sm font-medium text-primary">
            {totalSetsCompleted} set{totalSetsCompleted !== 1 ? 's' : ''} crushed!
          </span>
        </div>
      )}

      {/* Current Block */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <Badge
                className={cn('mb-2', BLOCK_CONFIG[currentBlock.type as BlockType]?.color)}
                variant="outline"
              >
                {BLOCK_CONFIG[currentBlock.type as BlockType]?.label || currentBlock.type}
              </Badge>
              <CardTitle>{currentBlock.intent || BLOCK_CONFIG[currentBlock.type as BlockType]?.description}</CardTitle>
            </div>
            <span className="text-sm text-muted-foreground">
              ~{currentBlock.timeTarget}m
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {currentBlock.exercises.length > 0 ? (
            <div className="space-y-4">
              {currentBlock.exercises.map((exerciseInstance, index) => (
                <ExerciseBlock
                  key={exerciseInstance.id}
                  exerciseInstance={exerciseInstance}
                  isLast={index === currentBlock.exercises.length - 1}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                {getBlockInstructions(currentBlock.type as BlockType)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Complete Block Button */}
      <Button
        className={cn(
          "w-full transition-all",
          isCurrentBlockComplete && "bg-success hover:bg-success/90 animate-glow"
        )}
        size="lg"
        onClick={handleBlockComplete}
      >
        {currentBlockIndex < totalBlocks - 1 ? (
          isCurrentBlockComplete ? (
            <span className="flex items-center gap-2">
              <span className="text-lg">🎯</span> Block Complete - Next!
            </span>
          ) : (
            'Complete Block'
          )
        ) : (
          isCurrentBlockComplete ? (
            <span className="flex items-center gap-2">
              <span className="text-lg">🏆</span> Finish & Celebrate!
            </span>
          ) : (
            'Finish & Reflect'
          )
        )}
      </Button>

      {/* Block Navigation */}
      <div className="flex justify-center gap-2 mt-6">
        {workoutData.blocks.map((block, index) => (
          <button
            key={block.id}
            onClick={() => setCurrentBlockIndex(index)}
            className={cn(
              'w-2 h-2 rounded-full transition-colors',
              index === currentBlockIndex
                ? 'bg-primary'
                : block.completed
                  ? 'bg-success'
                  : 'bg-secondary'
            )}
          />
        ))}
      </div>
    </div>
  )
}

// Exercise block component
function ExerciseBlock({
  exerciseInstance,
  isLast,
}: {
  exerciseInstance: {
    id: string
    exercise?: { name: string; cues: string[] }
    sets: SetInstance[]
    notes: string
  }
  isLast: boolean
}) {
  const [expandedSet, setExpandedSet] = useState<number | null>(0)
  const [celebratingSet, setCelebratingSet] = useState<number | null>(null)
  const [celebrationMessage, setCelebrationMessage] = useState<string>('')

  const completedSets = exerciseInstance.sets.filter(s => s.completed).length
  const totalSets = exerciseInstance.sets.length
  const allSetsComplete = completedSets === totalSets

  const handleSetComplete = async (set: SetInstance, data: Partial<SetInstance>) => {
    const currentIndex = exerciseInstance.sets.findIndex(s => s.id === set.id)

    // Show celebration
    setCelebratingSet(currentIndex)
    setCelebrationMessage(getEncouragingMessage())

    await db.setInstances.update(set.id, {
      ...data,
      completed: true,
    })

    // Clear celebration after animation
    setTimeout(() => {
      setCelebratingSet(null)
      setCelebrationMessage('')
    }, 1500)

    // Move to next set
    if (currentIndex < exerciseInstance.sets.length - 1) {
      setExpandedSet(currentIndex + 1)
    } else {
      setExpandedSet(null)
    }
  }

  return (
    <div className={cn('pb-4 relative', !isLast && 'border-b border-border')}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">{exerciseInstance.exercise?.name || 'Exercise'}</h4>
          {allSetsComplete && (
            <span className="text-success animate-bounce-in text-lg">✓</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Mini progress dots */}
          <div className="flex gap-1">
            {exerciseInstance.sets.map((set, i) => (
              <div
                key={i}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  set.completed
                    ? 'bg-success scale-110'
                    : 'bg-secondary',
                  celebratingSet === i && 'animate-pulse-success'
                )}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-1">
            {completedSets}/{totalSets}
          </span>
        </div>
      </div>

      {/* Celebration message */}
      {celebrationMessage && (
        <div className="absolute top-0 right-0 animate-slide-up">
          <span className="text-sm font-bold text-success bg-success/10 px-2 py-1 rounded-full">
            {celebrationMessage}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {exerciseInstance.sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            setNumber={index + 1}
            isExpanded={expandedSet === index}
            onExpand={() => setExpandedSet(expandedSet === index ? null : index)}
            onComplete={(data) => handleSetComplete(set, data)}
            justCompleted={celebratingSet === index}
          />
        ))}
      </div>

      {exerciseInstance.exercise?.cues && exerciseInstance.exercise.cues.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          Cues: {exerciseInstance.exercise.cues.join(' | ')}
        </p>
      )}
    </div>
  )
}

// Individual set row
function SetRow({
  set,
  setNumber,
  isExpanded,
  onExpand,
  onComplete,
  justCompleted = false,
}: {
  set: SetInstance
  setNumber: number
  isExpanded: boolean
  onExpand: () => void
  onComplete: (data: Partial<SetInstance>) => void
  justCompleted?: boolean
}) {
  const [weight, setWeight] = useState(set.actualWeight ?? set.targetWeight ?? 0)
  const [reps, setReps] = useState(set.actualReps ?? set.targetReps ?? 0)
  const [rpe, setRpe] = useState(set.actualRPE ?? set.targetRPE ?? 7)

  if (set.completed) {
    return (
      <div
        className={cn(
          'flex items-center justify-between rounded-lg p-3 transition-all duration-300',
          justCompleted
            ? 'bg-success/20 border border-success/30 animate-set-complete'
            : 'bg-secondary/50'
        )}
      >
        <span className="text-sm text-muted-foreground">Set {setNumber}</span>
        <div className="flex items-center gap-3 text-sm">
          <span className={cn(justCompleted && 'font-semibold')}>{set.actualWeight} lbs</span>
          <span className={cn(justCompleted && 'font-semibold')}>x {set.actualReps}</span>
          <span className={cn('font-mono', getRPEColor(set.actualRPE || 0))}>
            @{set.actualRPE}
          </span>
          <div className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center',
            justCompleted ? 'bg-success text-white animate-bounce-in' : 'text-success'
          )}>
            {justCompleted ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path className="animate-checkmark" d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span>✓</span>
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
        className="w-full flex items-center justify-between bg-card border border-border rounded-lg p-3 text-left hover:border-primary/50 transition-colors"
      >
        <span className="text-sm font-medium">Set {setNumber}</span>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{set.targetWeight} lbs</span>
          <span>x {set.targetReps}</span>
          <span>@{set.targetRPE}</span>
        </div>
      </button>
    )
  }

  return (
    <div className="bg-card border-2 border-primary rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">Set {setNumber}</span>
        <span className="text-xs text-muted-foreground">
          Target: {set.targetWeight} x {set.targetReps} @{set.targetRPE}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Weight</label>
          <Input
            type="number"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="text-center"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Reps</label>
          <Input
            type="number"
            value={reps}
            onChange={(e) => setReps(Number(e.target.value))}
            className="text-center"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">RPE</label>
          <Input
            type="number"
            min={1}
            max={10}
            value={rpe}
            onChange={(e) => setRpe(Number(e.target.value))}
            className={cn('text-center', getRPEColor(rpe))}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {RPE_DESCRIPTIONS[rpe]}
      </p>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onExpand}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-success hover:bg-success/90 text-white font-semibold"
          onClick={() => onComplete({ actualWeight: weight, actualReps: reps, actualRPE: rpe })}
        >
          <span className="mr-1">✓</span> Log Set
        </Button>
      </div>
    </div>
  )
}

// Reflection form with celebration
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
    energy: 7,
    performance: 7,
    sleepQuality: 7,
    sleepHours: 7,
    hydration: 7,
    nutrition: 7,
    stress: 5,
    motivation: 7,
    overallSatisfaction: 7,
    winOfTheDay: '',
    struggleOfTheDay: '',
    freeformNotes: '',
    painNotes: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationData, setCelebrationData] = useState<{
    newStreak: number
    totalWorkouts: number
    newAchievements: AchievementId[]
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
    await db.workouts.update(workoutId, {
      status: 'completed',
      completedAt: new Date(),
    })

    // Get user and update streak/achievements
    const user = await getCurrentUser()
    if (user) {
      // Update streak and check for streak/workout achievements
      const streakAchievements = await updateStreakOnWorkoutComplete(user.id)

      // Check for time-based achievements
      const timeAchievements = await checkTimeBasedAchievements(user.id)

      // Check for iron will achievement (low energy workout)
      const ironWillUnlocked = await checkIronWillAchievement(user.id, reflection.energy)

      // Get updated user stats
      const updatedUser = await getCurrentUser()

      const allNewAchievements = [
        ...streakAchievements,
        ...timeAchievements,
        ...(ironWillUnlocked ? ['iron_will' as AchievementId] : []),
      ]

      setCelebrationData({
        newStreak: updatedUser?.currentStreak ?? 1,
        totalWorkouts: updatedUser?.totalWorkoutsCompleted ?? 1,
        newAchievements: allNewAchievements,
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
        <h1 className="text-2xl font-bold">Post-Workout Reflection</h1>
        <p className="text-sm text-muted-foreground">
          How did it go? Be honest—this data drives your programming.
        </p>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How Are You Feeling?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Slider
              label="Energy Level"
              value={reflection.energy}
              onChange={(v) => setReflection((r) => ({ ...r, energy: v }))}
            />
            <Slider
              label="Performance"
              value={reflection.performance}
              onChange={(v) => setReflection((r) => ({ ...r, performance: v }))}
            />
            <Slider
              label="Overall Satisfaction"
              value={reflection.overallSatisfaction}
              onChange={(v) => setReflection((r) => ({ ...r, overallSatisfaction: v }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recovery Factors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Slider
              label="Sleep Quality (last night)"
              value={reflection.sleepQuality}
              onChange={(v) => setReflection((r) => ({ ...r, sleepQuality: v }))}
            />
            <Slider
              label="Sleep Hours"
              min={4}
              max={10}
              value={reflection.sleepHours}
              onChange={(v) => setReflection((r) => ({ ...r, sleepHours: v }))}
              valueFormatter={(v) => `${v}h`}
            />
            <Slider
              label="Hydration"
              value={reflection.hydration}
              onChange={(v) => setReflection((r) => ({ ...r, hydration: v }))}
            />
            <Slider
              label="Nutrition"
              value={reflection.nutrition}
              onChange={(v) => setReflection((r) => ({ ...r, nutrition: v }))}
            />
            <Slider
              label="Stress Level"
              value={reflection.stress}
              onChange={(v) => setReflection((r) => ({ ...r, stress: v }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Win of the Day"
              placeholder="What went well?"
              value={reflection.winOfTheDay}
              onChange={(e) => setReflection((r) => ({ ...r, winOfTheDay: e.target.value }))}
            />
            <Input
              label="Challenge"
              placeholder="What was hard?"
              value={reflection.struggleOfTheDay}
              onChange={(e) => setReflection((r) => ({ ...r, struggleOfTheDay: e.target.value }))}
            />
            <Input
              label="Pain Notes"
              placeholder="Any discomfort? Where?"
              value={reflection.painNotes}
              onChange={(e) => setReflection((r) => ({ ...r, painNotes: e.target.value }))}
            />
          </CardContent>
        </Card>

        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          loading={isSubmitting}
        >
          Complete Workout
        </Button>
      </div>
    </div>
  )
}

// Celebration screen shown after completing workout
function CelebrationScreen({
  workoutName,
  streak,
  totalWorkouts,
  newAchievements,
  onContinue,
}: {
  workoutName: string
  streak: number
  totalWorkouts: number
  newAchievements: AchievementId[]
  onContinue: () => void
}) {
  const [showAchievements, setShowAchievements] = useState(false)

  useEffect(() => {
    // Delay showing achievements for animation effect
    if (newAchievements.length > 0) {
      const timer = setTimeout(() => setShowAchievements(true), 800)
      return () => clearTimeout(timer)
    }
  }, [newAchievements])

  const streakMessage = getStreakMessage(streak)
  const isOnFire = streak >= 3

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      {/* Celebration Icon */}
      <div className="mb-6 animate-bounce">
        <span className="text-7xl">{isOnFire ? '🔥' : '✓'}</span>
      </div>

      {/* Workout Complete Message */}
      <h1 className="text-3xl font-black mb-2">FORGED</h1>
      <p className="text-muted-foreground mb-8">{workoutName} complete</p>

      {/* Streak Display */}
      <Card className={cn(
        'w-full max-w-sm mb-6',
        isOnFire && 'border-primary/50 bg-gradient-to-br from-primary/10 to-transparent'
      )}>
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className={cn(
                'text-6xl font-black font-mono',
                isOnFire ? 'text-primary' : 'text-foreground'
              )}>
                {streak}
              </div>
              <p className="text-sm text-muted-foreground mt-1">day streak</p>
            </div>
          </div>
          <p className="text-sm text-center mt-4 text-muted-foreground">
            {streakMessage}
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="flex gap-8 mb-8">
        <div className="text-center">
          <p className="text-2xl font-bold font-mono">{totalWorkouts}</p>
          <p className="text-xs text-muted-foreground">total workouts</p>
        </div>
      </div>

      {/* New Achievements */}
      {newAchievements.length > 0 && showAchievements && (
        <div className="w-full max-w-sm mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <p className="text-sm font-medium mb-3 text-primary">New Achievement{newAchievements.length > 1 ? 's' : ''} Unlocked!</p>
          <div className="space-y-2">
            {newAchievements.map((achievementId) => {
              const achievement = ACHIEVEMENTS[achievementId]
              if (!achievement) return null
              return (
                <Card key={achievementId} className="border-primary/30 bg-primary/5">
                  <CardContent className="py-3 flex items-center gap-3">
                    <span className="text-3xl">{achievement.icon}</span>
                    <div className="text-left">
                      <p className="font-medium">{achievement.name}</p>
                      <p className="text-xs text-muted-foreground">{achievement.description}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Motivational Quote */}
      <p className="text-sm text-muted-foreground italic mb-8 max-w-xs">
        {getMotivationalQuote()}
      </p>

      {/* Continue Button */}
      <Button size="lg" onClick={onContinue} className="w-full max-w-sm">
        Continue
      </Button>
    </div>
  )
}

// Summary view for completed workouts (viewing from history)
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
      winOfTheDay: string
    } | null
  }
  onBack: () => void
}) {
  const completedDate = workout.completedAt ? new Date(workout.completedAt) : null

  // Fetch QuickLog entries if this is a quick_log workout
  const quickLogEntries = useLiveQuery(
    async () => {
      if (workout.workoutType !== 'quick_log') return null
      return db.quickLogEntries
        .where('workoutId')
        .equals(workout.id)
        .sortBy('order')
    },
    [workout.id, workout.workoutType]
  )

  // Check if there are any exercises from blocks
  const hasBlockExercises = workout.blocks.some(block =>
    block.exercises.some(ex => ex.sets.some(s => s.completed))
  )

  // Calculate total stats
  const totalSets = workout.blocks.reduce((acc, block) => {
    return acc + block.exercises.reduce((setAcc, ex) => {
      return setAcc + ex.sets.filter(s => s.completed).length
    }, 0)
  }, 0) + (quickLogEntries?.reduce((acc, entry) => {
    return acc + entry.sets.filter(s => s.completed).length
  }, 0) || 0)

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center flex-1">
          <h1 className="text-xl font-bold">{workout.name}</h1>
          <Badge variant="success" className="mt-1">Completed</Badge>
        </div>
        <div className="w-10" /> {/* Spacer */}
      </header>

      {/* Date & Time Card */}
      {completedDate && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="font-medium">
                  {completedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {completedDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {/* Stats */}
              <div className="text-right">
                {totalSets > 0 && (
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-2xl">💪</span>
                    <div>
                      <p className="text-lg font-bold text-primary">{totalSets}</p>
                      <p className="text-xs text-muted-foreground">sets</p>
                    </div>
                  </div>
                )}
                {workout.totalDuration && workout.totalDuration > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {workout.totalDuration} min
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reflection Summary */}
      {workout.reflection && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Session Reflection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Energy</p>
                <p className="text-lg font-bold">{workout.reflection.energy}/10</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Performance</p>
                <p className="text-lg font-bold">{workout.reflection.performance}/10</p>
              </div>
            </div>
            {workout.reflection.winOfTheDay && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-sm text-muted-foreground">Win of the Day</p>
                <p className="text-sm">"{workout.reflection.winOfTheDay}"</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Exercise Summary - Programmed Workouts */}
      {hasBlockExercises && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Exercises</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {workout.blocks.map((block) => (
                <div key={block.id}>
                  {block.exercises.map((exerciseInstance) => {
                    const completedSets = exerciseInstance.sets.filter(s => s.completed)
                    if (completedSets.length === 0) return null

                    return (
                      <div key={exerciseInstance.id} className="mb-4 last:mb-0">
                        <h4 className="font-medium mb-2">
                          {exerciseInstance.exercise?.name || 'Exercise'}
                        </h4>
                        <div className="space-y-1">
                          {completedSets.map((set, index) => (
                            <div
                              key={set.id}
                              className="flex items-center justify-between text-sm bg-secondary/50 rounded px-3 py-2"
                            >
                              <span className="text-muted-foreground">Set {index + 1}</span>
                              <div className="flex items-center gap-3">
                                <span>{set.actualWeight || set.targetWeight} lbs</span>
                                <span>x {set.actualReps || set.targetReps}</span>
                                {(set.actualRPE || set.targetRPE) && (
                                  <span className={cn('font-mono', getRPEColor(set.actualRPE || set.targetRPE || 0))}>
                                    @{set.actualRPE || set.targetRPE}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exercise Summary - Quick Log Workouts */}
      {quickLogEntries && quickLogEntries.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Exercises</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {quickLogEntries.map((entry) => {
                const completedSets = entry.sets.filter(s => s.completed)
                if (completedSets.length === 0) return null

                return (
                  <div key={entry.id} className="mb-4 last:mb-0">
                    <h4 className="font-medium mb-2">{entry.exerciseName}</h4>
                    <div className="space-y-1">
                      {completedSets.map((set, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between text-sm bg-secondary/50 rounded px-3 py-2"
                        >
                          <span className="text-muted-foreground">Set {index + 1}</span>
                          <div className="flex items-center gap-3">
                            {set.weight && <span>{set.weight} lbs</span>}
                            {set.reps && <span>x {set.reps}</span>}
                            {set.duration && <span>{set.duration}s</span>}
                            {set.rpe && (
                              <span className={cn('font-mono', getRPEColor(set.rpe))}>
                                @{set.rpe}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {entry.notes && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No exercise data message */}
      {!hasBlockExercises && (!quickLogEntries || quickLogEntries.length === 0) && (
        <Card className="mb-4">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No exercise data recorded</p>
            <p className="text-xs text-muted-foreground mt-1">
              This workout may have been a cardio session or quick completion
            </p>
          </CardContent>
        </Card>
      )}

      {/* Back Button */}
      <div className="mt-6">
        <Button variant="outline" className="w-full" onClick={onBack}>
          Back to History
        </Button>
      </div>
    </div>
  )
}

// Get random motivational quote
function getMotivationalQuote(): string {
  const quotes = [
    "Every rep shapes who you become.",
    "The iron never lies.",
    "Discipline is choosing what you want most over what you want now.",
    "You don't have to be extreme, just consistent.",
    "The only bad workout is the one that didn't happen.",
    "Progress, not perfection.",
    "Trust the process.",
    "Your body can do it. It's your mind you need to convince.",
    "The pain you feel today is the strength you feel tomorrow.",
    "Champions are made when no one is watching.",
  ]
  return quotes[Math.floor(Math.random() * quotes.length)]
}

// Helper functions
function getBlockInstructions(blockType: BlockType): string {
  switch (blockType) {
    case 'warmup':
      return 'Complete your warmup: foam rolling, dynamic stretches, and movement prep. Tap complete when ready.'
    case 'cooldown':
      return 'Cool down with static stretching and breathing. Take your time.'
    default:
      return 'Complete the exercises in this block, then tap complete.'
  }
}
