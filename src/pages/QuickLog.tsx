import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getCurrentUser, updateStreakOnWorkoutComplete, checkTimeBasedAchievements } from '@/db'
import { EXERCISE_LIBRARY, searchExercises, CARDIO_EXERCISES } from '@/db/exercises'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge } from '@/components/ui'
import { cn, generateId, formatDuration } from '@/lib/utils'
import type {
  Workout,
  QuickLogEntry,
  QuickLogSet,
  Exercise,
  CardioWorkoutData,
  CardioType,
  DistanceUnit,
  PaceUnit,
} from '@/lib/types'

// ============================================================================
// QuickLog Page
// ============================================================================

export function QuickLog() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())
  const [mode, setMode] = useState<'select' | 'strength' | 'cardio'>('select')
  const [workoutStarted, setWorkoutStarted] = useState(false)
  const [workoutId, setWorkoutId] = useState<string | null>(null)
  const [entries, setEntries] = useState<QuickLogEntryState[]>([])
  const [cardioData, setCardioData] = useState<CardioWorkoutData | null>(null)
  const [workoutName, setWorkoutName] = useState('')
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Start workout
  const startWorkout = (type: 'strength' | 'cardio') => {
    setMode(type)
    setWorkoutStarted(true)
    setStartTime(new Date())
    const id = generateId()
    setWorkoutId(id)

    if (type === 'cardio') {
      setCardioData({
        cardioType: 'running',
        distance: null,
        distanceUnit: user?.preferences.weightUnit === 'lbs' ? 'miles' : 'km',
        duration: 0,
        pace: null,
        paceUnit: user?.preferences.weightUnit === 'lbs' ? 'min_per_mile' : 'min_per_km',
        calories: null,
        avgHeartRate: null,
        maxHeartRate: null,
        elevationGain: null,
        route: null,
        notes: '',
      })
    }
  }

  // Calculate duration
  const getDuration = () => {
    if (!startTime) return 0
    return Math.floor((new Date().getTime() - startTime.getTime()) / 1000 / 60)
  }

  // Save workout
  const saveWorkout = async () => {
    if (!user || !workoutId) return
    setIsSaving(true)

    try {
      const workout: Workout = {
        id: workoutId,
        userId: user.id,
        weekId: null,
        workoutType: mode === 'cardio' ? 'cardio' : 'quick_log',
        dayOfWeek: new Date().getDay(),
        scheduledDate: new Date(),
        completedAt: new Date(),
        status: 'completed',
        name: workoutName || (mode === 'cardio' ? `${cardioData?.cardioType || 'Cardio'} Session` : 'Quick Log'),
        totalDuration: getDuration(),
        coachingNotes: [],
        skipReason: null,
        cardioData: mode === 'cardio' ? cardioData || undefined : undefined,
      }

      await db.workouts.add(workout)

      // Save exercise entries for strength workouts
      if (mode === 'strength') {
        for (const entry of entries) {
          const logEntry: QuickLogEntry = {
            id: generateId(),
            workoutId: workoutId,
            exerciseId: entry.exercise.id,
            exerciseName: entry.exercise.name,
            order: entry.order,
            sets: entry.sets,
            notes: entry.notes,
          }
          await db.quickLogEntries.add(logEntry)

          // Check for PRs on strength exercises
          for (const set of entry.sets) {
            if (set.completed && set.weight && set.reps) {
              const { checkAndRecordPR } = await import('@/db')
              await checkAndRecordPR(user.id, entry.exercise.id, set.weight, set.reps, set.rpe)
            }
          }
        }
      }

      // Update streak and check achievements
      await updateStreakOnWorkoutComplete(user.id)
      await checkTimeBasedAchievements(user.id)

      navigate('/')
    } catch (error) {
      console.error('Failed to save workout:', error)
      setIsSaving(false)
    }
  }

  if (!user) return null

  // Mode selection
  if (!workoutStarted) {
    return (
      <div className="min-h-screen bg-background p-4 safe-area-inset">
        <header className="mb-8 pt-2">
          <h1 className="text-2xl font-bold text-foreground">Quick Log</h1>
          <p className="text-muted-foreground mt-1">Log any workout without a plan</p>
        </header>

        <div className="space-y-4">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => startWorkout('strength')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <span className="text-3xl">🏋️</span>
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground">Strength Training</h3>
                  <p className="text-sm text-muted-foreground">Log exercises, sets, reps, and weight</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => startWorkout('cardio')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <span className="text-3xl">🏃</span>
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground">Cardio</h3>
                  <p className="text-sm text-muted-foreground">Log runs, walks, cycling, swimming</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Button
          variant="ghost"
          className="w-full mt-6"
          onClick={() => navigate('/')}
        >
          Cancel
        </Button>
      </div>
    )
  }

  // Cardio logging
  if (mode === 'cardio' && cardioData) {
    return (
      <CardioLogger
        data={cardioData}
        setData={setCardioData}
        workoutName={workoutName}
        setWorkoutName={setWorkoutName}
        onSave={saveWorkout}
        onCancel={() => {
          setWorkoutStarted(false)
          setMode('select')
        }}
        isSaving={isSaving}
        duration={getDuration()}
        distanceUnit={user.preferences.weightUnit === 'lbs' ? 'miles' : 'km'}
      />
    )
  }

  // Strength logging
  return (
    <StrengthLogger
      entries={entries}
      setEntries={setEntries}
      workoutName={workoutName}
      setWorkoutName={setWorkoutName}
      onSave={saveWorkout}
      onCancel={() => {
        setWorkoutStarted(false)
        setMode('select')
      }}
      isSaving={isSaving}
      duration={getDuration()}
      weightUnit={user.preferences.weightUnit}
    />
  )
}

// ============================================================================
// Strength Logger
// ============================================================================

interface QuickLogEntryState {
  id: string
  exercise: Exercise
  order: number
  sets: QuickLogSet[]
  notes: string
}

function StrengthLogger({
  entries,
  setEntries,
  workoutName,
  setWorkoutName,
  onSave,
  onCancel,
  isSaving,
  duration,
  weightUnit,
}: {
  entries: QuickLogEntryState[]
  setEntries: React.Dispatch<React.SetStateAction<QuickLogEntryState[]>>
  workoutName: string
  setWorkoutName: (name: string) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
  duration: number
  weightUnit: 'lbs' | 'kg'
}) {
  const [showExerciseSearch, setShowExerciseSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const filteredExercises = useMemo(() => {
    let results = EXERCISE_LIBRARY.filter(ex => ex.category !== 'cardio')

    if (searchQuery) {
      results = searchExercises(searchQuery).filter(ex => ex.category !== 'cardio')
    }

    if (selectedCategory) {
      results = results.filter(ex =>
        ex.primaryMuscles.some(muscle => muscle.toLowerCase() === selectedCategory.toLowerCase())
      )
    }

    return results.slice(0, 50)
  }, [searchQuery, selectedCategory])

  const muscleGroups = [
    { id: 'chest', label: 'Chest' },
    { id: 'back', label: 'Back' },
    { id: 'shoulders', label: 'Shoulders' },
    { id: 'quads', label: 'Quads' },
    { id: 'hamstrings', label: 'Hamstrings' },
    { id: 'glutes', label: 'Glutes' },
    { id: 'biceps', label: 'Biceps' },
    { id: 'triceps', label: 'Triceps' },
    { id: 'core', label: 'Core' },
    { id: 'calves', label: 'Calves' },
    { id: 'forearms', label: 'Forearms' },
  ]

  const addExercise = (exercise: Exercise) => {
    const newEntry: QuickLogEntryState = {
      id: generateId(),
      exercise,
      order: entries.length,
      sets: [{ setNumber: 1, weight: null, reps: null, duration: null, distance: null, rpe: null, completed: false }],
      notes: '',
    }
    setEntries([...entries, newEntry])
    setShowExerciseSearch(false)
    setSearchQuery('')
    setSelectedCategory(null)
  }

  const addSet = (entryId: string) => {
    setEntries(entries.map(e => {
      if (e.id === entryId) {
        return {
          ...e,
          sets: [
            ...e.sets,
            {
              setNumber: e.sets.length + 1,
              weight: e.sets[e.sets.length - 1]?.weight || null,
              reps: e.sets[e.sets.length - 1]?.reps || null,
              duration: null,
              distance: null,
              rpe: null,
              completed: false,
            },
          ],
        }
      }
      return e
    }))
  }

  const updateSet = (entryId: string, setIndex: number, updates: Partial<QuickLogSet>) => {
    setEntries(entries.map(e => {
      if (e.id === entryId) {
        const newSets = [...e.sets]
        newSets[setIndex] = { ...newSets[setIndex], ...updates }
        return { ...e, sets: newSets }
      }
      return e
    }))
  }

  const removeEntry = (entryId: string) => {
    setEntries(entries.filter(e => e.id !== entryId))
  }

  const removeSet = (entryId: string, setIndex: number) => {
    setEntries(entries.map(e => {
      if (e.id === entryId && e.sets.length > 1) {
        const newSets = e.sets.filter((_, i) => i !== setIndex).map((s, i) => ({ ...s, setNumber: i + 1 }))
        return { ...e, sets: newSets }
      }
      return e
    }))
  }

  if (showExerciseSearch) {
    return (
      <div className="min-h-screen bg-background p-4 safe-area-inset">
        <header className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Add Exercise</h2>
            <Button variant="ghost" size="sm" onClick={() => {
              setShowExerciseSearch(false)
              setSearchQuery('')
              setSelectedCategory(null)
            }}>
              Cancel
            </Button>
          </div>
        </header>

        <Input
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          className="mb-4"
        />

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {muscleGroups.map(muscle => (
            <button
              key={muscle.id}
              onClick={() => setSelectedCategory(selectedCategory === muscle.id ? null : muscle.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                selectedCategory === muscle.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground'
              )}
            >
              {muscle.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filteredExercises.map(exercise => (
            <button
              key={exercise.id}
              onClick={() => addExercise(exercise)}
              className="w-full text-left p-3 rounded-xl bg-card hover:bg-secondary transition-colors"
            >
              <p className="font-medium text-foreground">{exercise.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {exercise.primaryMuscles.join(', ')} • {exercise.category}
              </p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-32 safe-area-inset">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <Input
              placeholder="Workout name (optional)"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              className="text-lg font-bold bg-transparent border-none px-0 focus-visible:ring-0"
            />
          </div>
          <Badge variant="outline" className="font-mono">
            {formatDuration(duration * 60)}
          </Badge>
        </div>
      </header>

      <div className="space-y-4">
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{entry.exercise.name}</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-8 w-8 p-0"
                  onClick={() => removeEntry(entry.id)}
                >
                  ×
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {entry.exercise.primaryMuscles.join(', ')}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                  <div className="col-span-1">Set</div>
                  <div className="col-span-4">{weightUnit}</div>
                  <div className="col-span-3">Reps</div>
                  <div className="col-span-2">RPE</div>
                  <div className="col-span-2"></div>
                </div>

                {/* Sets */}
                {entry.sets.map((set, setIndex) => (
                  <div key={setIndex} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1 text-sm font-mono text-muted-foreground">
                      {set.setNumber}
                    </div>
                    <div className="col-span-4">
                      <Input
                        type="number"
                        placeholder="135"
                        value={set.weight || ''}
                        onChange={(e) => updateSet(entry.id, setIndex, { weight: parseFloat(e.target.value) || null })}
                        className="h-10 text-center"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        placeholder="10"
                        value={set.reps || ''}
                        onChange={(e) => updateSet(entry.id, setIndex, { reps: parseInt(e.target.value) || null })}
                        className="h-10 text-center"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="7"
                        value={set.rpe || ''}
                        onChange={(e) => updateSet(entry.id, setIndex, { rpe: parseFloat(e.target.value) || null })}
                        className="h-10 text-center"
                        min={1}
                        max={10}
                      />
                    </div>
                    <div className="col-span-2 flex justify-end gap-1">
                      <button
                        onClick={() => updateSet(entry.id, setIndex, { completed: !set.completed })}
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                          set.completed
                            ? 'bg-success text-white'
                            : 'bg-secondary text-muted-foreground'
                        )}
                      >
                        {set.completed ? '✓' : ''}
                      </button>
                      {entry.sets.length > 1 && (
                        <button
                          onClick={() => removeSet(entry.id, setIndex)}
                          className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center"
                        >
                          −
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-primary"
                  onClick={() => addSet(entry.id)}
                >
                  + Add Set
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button
          variant="outline"
          className="w-full h-14 border-dashed"
          onClick={() => setShowExerciseSearch(true)}
        >
          + Add Exercise
        </Button>
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t border-border safe-area-inset">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Discard
          </Button>
          <Button
            className="flex-1"
            onClick={onSave}
            disabled={entries.length === 0 || isSaving}
            loading={isSaving}
          >
            Complete Workout
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Cardio Logger
// ============================================================================

function CardioLogger({
  data,
  setData,
  workoutName,
  setWorkoutName,
  onSave,
  onCancel,
  isSaving,
  duration,
  distanceUnit,
}: {
  data: CardioWorkoutData
  setData: React.Dispatch<React.SetStateAction<CardioWorkoutData | null>>
  workoutName: string
  setWorkoutName: (name: string) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
  duration: number
  distanceUnit: 'miles' | 'km'
}) {
  const [durationMinutes, setDurationMinutes] = useState('')
  const [durationSeconds, setDurationSeconds] = useState('')

  const cardioTypes: { value: CardioType; label: string; icon: string }[] = [
    { value: 'running', label: 'Run', icon: '🏃' },
    { value: 'walking', label: 'Walk', icon: '🚶' },
    { value: 'cycling', label: 'Bike', icon: '🚴' },
    { value: 'swimming', label: 'Swim', icon: '🏊' },
    { value: 'rowing', label: 'Row', icon: '🚣' },
    { value: 'hiking', label: 'Hike', icon: '🥾' },
    { value: 'elliptical', label: 'Elliptical', icon: '🔄' },
    { value: 'stair_climber', label: 'Stairs', icon: '🪜' },
    { value: 'jump_rope', label: 'Jump Rope', icon: '⏭️' },
    { value: 'other', label: 'Other', icon: '💪' },
  ]

  // Calculate pace when distance and duration change
  useEffect(() => {
    const totalSeconds = (parseInt(durationMinutes) || 0) * 60 + (parseInt(durationSeconds) || 0)
    if (data.distance && totalSeconds > 0) {
      const pace = totalSeconds / data.distance // seconds per unit
      setData(d => d ? { ...d, duration: totalSeconds, pace } : null)
    } else {
      setData(d => d ? { ...d, duration: totalSeconds } : null)
    }
  }, [durationMinutes, durationSeconds, data.distance])

  const formatPace = (paceSeconds: number | null) => {
    if (!paceSeconds) return '--:--'
    const mins = Math.floor(paceSeconds / 60)
    const secs = Math.round(paceSeconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const updateData = (updates: Partial<CardioWorkoutData>) => {
    setData(d => d ? { ...d, ...updates } : null)
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-32 safe-area-inset">
      <header className="mb-6">
        <Input
          placeholder="Workout name (optional)"
          value={workoutName}
          onChange={(e) => setWorkoutName(e.target.value)}
          className="text-lg font-bold bg-transparent border-none px-0 focus-visible:ring-0"
        />
      </header>

      {/* Cardio Type */}
      <div className="mb-6">
        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-3">
          Activity Type
        </label>
        <div className="grid grid-cols-5 gap-2">
          {cardioTypes.map(type => (
            <button
              key={type.value}
              onClick={() => updateData({ cardioType: type.value })}
              className={cn(
                'p-3 rounded-xl flex flex-col items-center gap-1 transition-colors',
                data.cardioType === type.value
                  ? 'bg-primary/10 border-2 border-primary'
                  : 'bg-card border-2 border-transparent'
              )}
            >
              <span className="text-xl">{type.icon}</span>
              <span className="text-xs font-medium">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Distance */}
        <Card>
          <CardContent className="pt-4">
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">
              Distance ({distanceUnit})
            </label>
            <Input
              type="number"
              placeholder="0.00"
              value={data.distance || ''}
              onChange={(e) => updateData({ distance: parseFloat(e.target.value) || null })}
              className="text-2xl font-bold h-14 text-center"
              step="0.01"
            />
          </CardContent>
        </Card>

        {/* Duration */}
        <Card>
          <CardContent className="pt-4">
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">
              Duration
            </label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="00"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="text-2xl font-bold h-14 text-center"
              />
              <span className="text-xl text-muted-foreground">:</span>
              <Input
                type="number"
                placeholder="00"
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(e.target.value)}
                className="text-2xl font-bold h-14 text-center"
                max={59}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calculated Pace */}
      {data.distance && data.duration > 0 && (
        <Card className="mb-6 bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Average Pace
                </label>
                <p className="text-3xl font-bold text-primary font-mono">
                  {formatPace(data.pace)}
                </p>
                <p className="text-xs text-muted-foreground">
                  per {distanceUnit === 'miles' ? 'mile' : 'km'}
                </p>
              </div>
              <div className="text-4xl">⚡</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Additional metrics */}
      <div className="space-y-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">
                  Calories
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={data.calories || ''}
                  onChange={(e) => updateData({ calories: parseInt(e.target.value) || null })}
                  className="h-12"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">
                  Elevation (ft)
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={data.elevationGain || ''}
                  onChange={(e) => updateData({ elevationGain: parseInt(e.target.value) || null })}
                  className="h-12"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">
                  Avg Heart Rate
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={data.avgHeartRate || ''}
                  onChange={(e) => updateData({ avgHeartRate: parseInt(e.target.value) || null })}
                  className="h-12"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">
                  Max Heart Rate
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={data.maxHeartRate || ''}
                  onChange={(e) => updateData({ maxHeartRate: parseInt(e.target.value) || null })}
                  className="h-12"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">
              Notes
            </label>
            <textarea
              placeholder="How did it feel? Route details..."
              value={data.notes}
              onChange={(e) => updateData({ notes: e.target.value })}
              className="w-full h-24 bg-secondary rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </CardContent>
        </Card>
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t border-border safe-area-inset">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Discard
          </Button>
          <Button
            className="flex-1"
            onClick={onSave}
            disabled={isSaving}
            loading={isSaving}
          >
            Save Activity
          </Button>
        </div>
      </div>
    </div>
  )
}
