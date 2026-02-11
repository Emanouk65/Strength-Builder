import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, getCurrentUser, getActivePhase } from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Progress } from '@/components/ui'
import { cn, formatDate, getShortDayName, generateId } from '@/lib/utils'
import { PHASE_CONFIG, BLOCK_CONFIG } from '@/lib/constants'
import type { Phase, Week, Workout, WorkoutBlock, ExerciseInstance, SetInstance, PhaseType, BlockType } from '@/lib/types'

export function Program() {
  const user = useLiveQuery(() => getCurrentUser())
  const activePhase = useLiveQuery(
    async () => {
      if (!user) return null
      return getActivePhase(user.id)
    },
    [user]
  )
  const weeks = useLiveQuery(
    async () => {
      if (!activePhase) return []
      return db.weeks.where('phaseId').equals(activePhase.id).sortBy('weekNumber')
    },
    [activePhase]
  )
  const workouts = useLiveQuery(
    async () => {
      if (!weeks || weeks.length === 0) return []
      const weekIds = weeks.map((w) => w.id)
      return db.workouts.where('weekId').anyOf(weekIds).toArray()
    },
    [weeks]
  )

  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedPhaseType, setSelectedPhaseType] = useState<PhaseType>('base')

  if (!user) return null

  const handleGenerateProgram = async () => {
    setIsGenerating(true)

    try {
      // Generate a 4-week phase
      const phase = await generatePhase(user.id, selectedPhaseType, user.preferences.trainingDaysPerWeek, user.preferences.preferredDays)

      // Update user's current phase
      await db.users.update(user.id, { currentPhaseId: phase.id })

      setIsGenerating(false)
    } catch (error) {
      console.error('Failed to generate program:', error)
      setIsGenerating(false)
    }
  }

  // Group workouts by week
  const workoutsByWeek = new Map<string, typeof workouts>()
  if (workouts && weeks) {
    weeks.forEach((week) => {
      workoutsByWeek.set(
        week.id,
        (workouts || []).filter((w) => w.weekId === week.id).sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      )
    })
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Program</h1>
        <p className="text-sm text-muted-foreground">
          {activePhase
            ? `${PHASE_CONFIG[activePhase.type]?.label || activePhase.type} Phase`
            : 'No active program'}
        </p>
      </header>

      {!activePhase ? (
        // No program - show generation UI
        <Card>
          <CardHeader>
            <CardTitle>Generate Your Program</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a phase type to generate a 4-week training program based on your preferences.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {(['base', 'strength', 'hypertrophy', 'rebuild'] as PhaseType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedPhaseType(type)}
                  className={cn(
                    'rounded-lg border-2 p-3 text-left transition-all',
                    selectedPhaseType === type
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:border-muted-foreground/50'
                  )}
                >
                  <span className="font-medium text-sm">{PHASE_CONFIG[type].label}</span>
                  <span className="text-xs text-muted-foreground block mt-1">
                    {PHASE_CONFIG[type].defaultWeeks} weeks
                  </span>
                </button>
              ))}
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleGenerateProgram}
              loading={isGenerating}
            >
              Generate {PHASE_CONFIG[selectedPhaseType].label} Phase
            </Button>
          </CardContent>
        </Card>
      ) : (
        // Active program - show schedule
        <div className="space-y-4">
          {/* Phase overview */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline">{PHASE_CONFIG[activePhase.type]?.label}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(activePhase.startDate)} - {formatDate(activePhase.endDate)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {PHASE_CONFIG[activePhase.type]?.description}
              </p>
              <PhaseProgressBar phase={activePhase} />
            </CardContent>
          </Card>

          {/* Week views */}
          {weeks?.map((week) => (
            <WeekCard
              key={week.id}
              week={week}
              workouts={workoutsByWeek.get(week.id) || []}
              isCurrentWeek={isCurrentWeek(week)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WeekCard({
  week,
  workouts,
  isCurrentWeek,
}: {
  week: Week
  workouts: Workout[]
  isCurrentWeek: boolean
}) {
  const navigate = useNavigate()
  const completedCount = workouts.filter((w) => w.status === 'completed').length
  const skippedCount = workouts.filter((w) => w.status === 'skipped').length

  // Check if a workout is missed (past scheduled date, still planned)
  const isWorkoutMissed = (workout: Workout): boolean => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const scheduled = new Date(workout.scheduledDate)
    scheduled.setHours(0, 0, 0, 0)
    return scheduled < today && workout.status === 'planned'
  }

  return (
    <Card className={cn(isCurrentWeek && 'border-primary')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Week {week.weekNumber}</CardTitle>
            {isCurrentWeek && <Badge variant="default">Current</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{workouts.length} done
            {skippedCount > 0 && ` (${skippedCount} skipped)`}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
            const workout = workouts.find((w) => w.dayOfWeek === dayIndex)
            const isToday = isDayToday(week.startDate, dayIndex)
            const isMissed = workout ? isWorkoutMissed(workout) : false
            const isSkipped = workout?.status === 'skipped'

            return (
              <button
                key={dayIndex}
                onClick={() => workout && navigate(`/workout/${workout.id}`)}
                disabled={!workout || isSkipped}
                className={cn(
                  'aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-colors',
                  workout
                    ? workout.status === 'completed'
                      ? 'bg-success/20 text-success'
                      : isSkipped
                      ? 'bg-muted text-muted-foreground line-through opacity-50'
                      : isMissed
                      ? 'bg-warning/20 text-warning hover:bg-warning/30'
                      : isToday
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary hover:bg-secondary/80 text-foreground'
                    : 'bg-transparent text-muted-foreground/50'
                )}
              >
                <span className="font-medium">{getShortDayName(dayIndex)}</span>
                {workout && (
                  <span className="text-[10px] mt-0.5">
                    {workout.status === 'completed' ? '✓' :
                     workout.status === 'skipped' ? '—' :
                     isMissed ? '!' :
                     workout.name.split(' ')[0]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function PhaseProgressBar({ phase }: { phase: Phase }) {
  const start = new Date(phase.startDate)
  const end = new Date(phase.endDate)
  const today = new Date()
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const daysElapsed = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const progress = Math.min(Math.max((daysElapsed / totalDays) * 100, 0), 100)

  return <Progress value={progress} showLabel />
}

// Helper functions
function isCurrentWeek(week: Week): boolean {
  const today = new Date()
  const start = new Date(week.startDate)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return today >= start && today < end
}

function isDayToday(weekStart: Date, dayOffset: number): boolean {
  const today = new Date()
  const targetDate = new Date(weekStart)
  targetDate.setDate(targetDate.getDate() + dayOffset)
  return (
    today.getDate() === targetDate.getDate() &&
    today.getMonth() === targetDate.getMonth() &&
    today.getFullYear() === targetDate.getFullYear()
  )
}

// Program generation logic
async function generatePhase(
  userId: string,
  phaseType: PhaseType,
  daysPerWeek: number,
  preferredDays: number[]
): Promise<Phase> {
  const config = PHASE_CONFIG[phaseType]
  const startDate = new Date()
  startDate.setHours(0, 0, 0, 0)
  // Start from next Monday
  const dayOfWeek = startDate.getDay()
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  startDate.setDate(startDate.getDate() + daysUntilMonday)

  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + config.defaultWeeks * 7 - 1)

  // Create phase
  const phase: Phase = {
    id: generateId(),
    userId,
    name: `${config.label} Phase`,
    type: phaseType,
    startDate,
    endDate,
    weekCount: config.defaultWeeks,
    focus: {
      primaryLifts: ['barbell-back-squat', 'barbell-bench-press', 'conventional-deadlift'],
      intensityRange: config.intensityRange,
      volumeTarget: config.volumeTarget,
      conditioningPriority: phaseType === 'base' ? 'moderate' : 'low',
      aestheticFocus: [],
    },
    status: 'active',
    notes: '',
  }

  await db.phases.add(phase)

  // Generate weeks
  for (let weekNum = 1; weekNum <= config.defaultWeeks; weekNum++) {
    const weekStart = new Date(startDate)
    weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7)

    const week: Week = {
      id: generateId(),
      phaseId: phase.id,
      weekNumber: weekNum,
      startDate: weekStart,
      plannedVolume: getWeekVolume(weekNum, config.defaultWeeks, config.volumeTarget),
      actualVolume: 0,
      fatigueScore: null,
      status: weekNum === 1 ? 'active' : 'planned',
    }

    await db.weeks.add(week)

    // Generate workouts for this week
    await generateWeekWorkouts(userId, week, preferredDays.slice(0, daysPerWeek), phaseType)
  }

  return phase
}

async function generateWeekWorkouts(
  userId: string,
  week: Week,
  trainingDays: number[],
  phaseType: PhaseType
): Promise<void> {
  const workoutTemplates = getWorkoutTemplates(trainingDays.length, phaseType)

  for (let i = 0; i < trainingDays.length; i++) {
    const dayOfWeek = trainingDays[i]
    const template = workoutTemplates[i]

    const scheduledDate = new Date(week.startDate)
    scheduledDate.setDate(scheduledDate.getDate() + dayOfWeek)

    const workout: Workout = {
      id: generateId(),
      userId,
      weekId: week.id,
      workoutType: 'programmed',
      dayOfWeek,
      scheduledDate,
      completedAt: null,
      status: 'planned',
      name: template.name,
      totalDuration: template.duration,
      coachingNotes: [],
      skipReason: null,
    }

    await db.workouts.add(workout)

    // Generate blocks for this workout
    await generateWorkoutBlocks(workout.id, template.blocks)
  }
}

async function generateWorkoutBlocks(
  workoutId: string,
  blockTemplates: Array<{ type: BlockType; exercises: string[] }>
): Promise<void> {
  for (let i = 0; i < blockTemplates.length; i++) {
    const template = blockTemplates[i]

    const block: WorkoutBlock = {
      id: generateId(),
      workoutId,
      type: template.type,
      order: i,
      timeTarget: BLOCK_CONFIG[template.type]?.defaultDuration || 10,
      intent: BLOCK_CONFIG[template.type]?.description || '',
      completed: false,
    }

    await db.workoutBlocks.add(block)

    // Generate exercises for this block
    for (let j = 0; j < template.exercises.length; j++) {
      const exerciseId = template.exercises[j]

      const instance: ExerciseInstance = {
        id: generateId(),
        blockId: block.id,
        exerciseId,
        order: j,
        notes: '',
        substituteFor: null,
        substitutionReason: null,
      }

      await db.exerciseInstances.add(instance)

      // Generate sets
      const setCount = getSetCount(template.type)
      for (let k = 0; k < setCount; k++) {
        const set: SetInstance = {
          id: generateId(),
          exerciseInstanceId: instance.id,
          setNumber: k + 1,
          setType: 'working',
          targetReps: getTargetReps(template.type),
          targetWeight: null, // User fills in
          targetRPE: 7,
          targetDuration: null,
          actualReps: null,
          actualWeight: null,
          actualRPE: null,
          actualDuration: null,
          completed: false,
          skipped: false,
          painSignal: null,
        }

        await db.setInstances.add(set)
      }
    }
  }
}

// Template generators
function getWorkoutTemplates(
  daysPerWeek: number,
  _phaseType: PhaseType
): Array<{ name: string; duration: number; blocks: Array<{ type: BlockType; exercises: string[] }> }> {
  // Simplified templates - in production this would be much more sophisticated
  if (daysPerWeek <= 4) {
    return [
      {
        name: 'Upper A',
        duration: 60,
        blocks: [
          { type: 'warmup', exercises: [] },
          { type: 'primary', exercises: ['barbell-bench-press'] },
          { type: 'secondary', exercises: ['barbell-row', 'dumbbell-shoulder-press'] },
          { type: 'secondary', exercises: ['tricep-pushdown', 'barbell-curl'] },
          { type: 'core', exercises: ['plank'] },
          { type: 'cooldown', exercises: [] },
        ],
      },
      {
        name: 'Lower A',
        duration: 60,
        blocks: [
          { type: 'warmup', exercises: [] },
          { type: 'primary', exercises: ['barbell-back-squat'] },
          { type: 'secondary', exercises: ['rdl', 'leg-press'] },
          { type: 'secondary', exercises: ['lying-leg-curl', 'calf-raise'] },
          { type: 'core', exercises: ['dead-bug'] },
          { type: 'cooldown', exercises: [] },
        ],
      },
      {
        name: 'Upper B',
        duration: 60,
        blocks: [
          { type: 'warmup', exercises: [] },
          { type: 'primary', exercises: ['overhead-press'] },
          { type: 'secondary', exercises: ['pull-up', 'incline-dumbbell-press'] },
          { type: 'secondary', exercises: ['face-pull', 'hammer-curl'] },
          { type: 'core', exercises: ['pallof-press'] },
          { type: 'cooldown', exercises: [] },
        ],
      },
      {
        name: 'Lower B',
        duration: 60,
        blocks: [
          { type: 'warmup', exercises: [] },
          { type: 'primary', exercises: ['conventional-deadlift'] },
          { type: 'secondary', exercises: ['split-squat', 'hip-thrust'] },
          { type: 'secondary', exercises: ['leg-extension', 'seated-calf-raise'] },
          { type: 'core', exercises: ['hanging-leg-raise'] },
          { type: 'cooldown', exercises: [] },
        ],
      },
    ]
  }

  // 5-6 day templates
  return [
    {
      name: 'Push',
      duration: 60,
      blocks: [
        { type: 'warmup', exercises: [] },
        { type: 'primary', exercises: ['barbell-bench-press'] },
        { type: 'secondary', exercises: ['incline-dumbbell-press', 'dumbbell-shoulder-press'] },
        { type: 'secondary', exercises: ['lateral-raise', 'tricep-pushdown'] },
        { type: 'core', exercises: ['plank'] },
        { type: 'cooldown', exercises: [] },
      ],
    },
    {
      name: 'Pull',
      duration: 60,
      blocks: [
        { type: 'warmup', exercises: [] },
        { type: 'primary', exercises: ['barbell-row'] },
        { type: 'secondary', exercises: ['pull-up', 'cable-row'] },
        { type: 'secondary', exercises: ['face-pull', 'barbell-curl'] },
        { type: 'core', exercises: ['dead-bug'] },
        { type: 'cooldown', exercises: [] },
      ],
    },
    {
      name: 'Legs',
      duration: 65,
      blocks: [
        { type: 'warmup', exercises: [] },
        { type: 'primary', exercises: ['barbell-back-squat'] },
        { type: 'secondary', exercises: ['rdl', 'leg-press'] },
        { type: 'secondary', exercises: ['lying-leg-curl', 'calf-raise'] },
        { type: 'core', exercises: ['pallof-press'] },
        { type: 'cooldown', exercises: [] },
      ],
    },
    {
      name: 'Upper',
      duration: 60,
      blocks: [
        { type: 'warmup', exercises: [] },
        { type: 'primary', exercises: ['overhead-press'] },
        { type: 'secondary', exercises: ['chest-supported-row', 'incline-bench-press'] },
        { type: 'secondary', exercises: ['rear-delt-fly', 'skull-crusher'] },
        { type: 'core', exercises: ['ab-wheel'] },
        { type: 'cooldown', exercises: [] },
      ],
    },
    {
      name: 'Lower',
      duration: 65,
      blocks: [
        { type: 'warmup', exercises: [] },
        { type: 'primary', exercises: ['conventional-deadlift'] },
        { type: 'secondary', exercises: ['split-squat', 'hip-thrust'] },
        { type: 'secondary', exercises: ['leg-extension', 'seated-calf-raise'] },
        { type: 'conditioning', exercises: ['incline-walk'] },
        { type: 'cooldown', exercises: [] },
      ],
    },
    {
      name: 'Full Body',
      duration: 60,
      blocks: [
        { type: 'warmup', exercises: [] },
        { type: 'primary', exercises: ['front-squat'] },
        { type: 'secondary', exercises: ['dumbbell-bench-press', 'dumbbell-row'] },
        { type: 'secondary', exercises: ['walking-lunge', 'lateral-raise'] },
        { type: 'core', exercises: ['farmers-carry'] },
        { type: 'cooldown', exercises: [] },
      ],
    },
  ]
}

function getWeekVolume(
  weekNum: number,
  totalWeeks: number,
  volumeTarget: 'low' | 'moderate' | 'high'
): number {
  const baseVolume = volumeTarget === 'high' ? 120 : volumeTarget === 'moderate' ? 100 : 80

  // Week 4 is typically deload
  if (weekNum === totalWeeks) {
    return Math.round(baseVolume * 0.5)
  }

  // Progressive volume increase
  const progression = 1 + (weekNum - 1) * 0.1
  return Math.round(baseVolume * progression)
}

function getSetCount(blockType: BlockType): number {
  if (blockType === 'primary') return 4
  if (blockType === 'secondary') return 3
  if (blockType === 'core') return 3
  return 3
}

function getTargetReps(blockType: BlockType): number {
  if (blockType === 'primary') return 5
  if (blockType === 'secondary') return 10
  if (blockType === 'core') return 12
  return 10
}
