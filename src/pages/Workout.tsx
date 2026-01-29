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

  const currentBlock = workoutData.blocks[currentBlockIndex]
  const totalBlocks = workoutData.blocks.length
  const completedBlocks = workoutData.blocks.filter(b => b.completed).length
  const progress = (completedBlocks / totalBlocks) * 100

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
        <div className="w-10" /> {/* Spacer */}
      </header>

      {/* Progress bar */}
      <Progress value={progress} className="mb-6" />

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
        className="w-full"
        size="lg"
        onClick={handleBlockComplete}
      >
        {currentBlockIndex < totalBlocks - 1 ? 'Complete Block' : 'Finish & Reflect'}
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

  const handleSetComplete = async (set: SetInstance, data: Partial<SetInstance>) => {
    await db.setInstances.update(set.id, {
      ...data,
      completed: true,
    })
    // Move to next set
    const currentIndex = exerciseInstance.sets.findIndex(s => s.id === set.id)
    if (currentIndex < exerciseInstance.sets.length - 1) {
      setExpandedSet(currentIndex + 1)
    } else {
      setExpandedSet(null)
    }
  }

  return (
    <div className={cn('pb-4', !isLast && 'border-b border-border')}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium">{exerciseInstance.exercise?.name || 'Exercise'}</h4>
        <span className="text-xs text-muted-foreground">
          {exerciseInstance.sets.filter(s => s.completed).length}/{exerciseInstance.sets.length} sets
        </span>
      </div>

      <div className="space-y-2">
        {exerciseInstance.sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            setNumber={index + 1}
            isExpanded={expandedSet === index}
            onExpand={() => setExpandedSet(expandedSet === index ? null : index)}
            onComplete={(data) => handleSetComplete(set, data)}
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
}: {
  set: SetInstance
  setNumber: number
  isExpanded: boolean
  onExpand: () => void
  onComplete: (data: Partial<SetInstance>) => void
}) {
  const [weight, setWeight] = useState(set.actualWeight ?? set.targetWeight ?? 0)
  const [reps, setReps] = useState(set.actualReps ?? set.targetReps ?? 0)
  const [rpe, setRpe] = useState(set.actualRPE ?? set.targetRPE ?? 7)

  if (set.completed) {
    return (
      <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3">
        <span className="text-sm text-muted-foreground">Set {setNumber}</span>
        <div className="flex items-center gap-3 text-sm">
          <span>{set.actualWeight} lbs</span>
          <span>x {set.actualReps}</span>
          <span className={cn('font-mono', getRPEColor(set.actualRPE || 0))}>
            @{set.actualRPE}
          </span>
          <span className="text-success">&#10003;</span>
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
          className="flex-1"
          onClick={() => onComplete({ actualWeight: weight, actualReps: reps, actualRPE: rpe })}
        >
          Log Set
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
