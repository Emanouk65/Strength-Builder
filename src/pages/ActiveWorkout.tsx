import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  getCurrentUser,
  updateStreakOnWorkoutComplete,
  checkTimeBasedAchievements,
  getCustomExercises,
} from '@/db'
import { EXERCISE_LIBRARY, searchExercises } from '@/db/exercises'
import { Button } from '@/components/ui'
import { cn, generateId } from '@/lib/utils'
import { ACHIEVEMENTS, getStreakMessage } from '@/lib/constants'
import type {
  Exercise,
  QuickLogEntry,
  AchievementId,
  Workout,
} from '@/lib/types'

// ============================================================================
// Types
// ============================================================================

interface PlannedExercise {
  id: string
  exercise: Exercise
  order: number
  targetSets: number
  targetReps: number | null
  targetWeight: number | null
  notes: string
  supersetGroupId?: string
}

interface ActiveSet {
  setNumber: number
  weight: number | null
  reps: number | null
  rpe: number | null
  completed: boolean
}

interface ActiveExerciseState {
  id: string
  exercise: Exercise
  sets: ActiveSet[]
  notes: string
  supersetGroupId?: string
}

type WorkoutPhase = 'planning' | 'active' | 'celebration'

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_REST_SECONDS = 90
const MIN_REST_SECONDS = 60
const MAX_REST_SECONDS = 120
const SUPERSET_REST_SECONDS = 60

// ============================================================================
// Main Component
// ============================================================================

export function ActiveWorkout() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())
  const [phase, setPhase] = useState<WorkoutPhase>('planning')
  const [workoutName, setWorkoutName] = useState('')
  const [plannedExercises, setPlannedExercises] = useState<PlannedExercise[]>([])
  const [activeExercises, setActiveExercises] = useState<ActiveExerciseState[]>([])
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST_SECONDS)

  // Active workout state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentSetIndex, setCurrentSetIndex] = useState(0)
  const [showExerciseList, setShowExerciseList] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [celebrationData, setCelebrationData] = useState<CelebrationData | null>(null)

  if (!user) return null

  if (phase === 'planning') {
    return (
      <PlanningView
        workoutName={workoutName}
        setWorkoutName={setWorkoutName}
        exercises={plannedExercises}
        setExercises={setPlannedExercises}
        weightUnit={user.preferences.weightUnit}
        onStart={() => {
          if (plannedExercises.length === 0) return
          // Convert planned exercises to active state
          const active: ActiveExerciseState[] = plannedExercises.map(pe => ({
            id: pe.id,
            exercise: pe.exercise,
            sets: Array.from({ length: pe.targetSets }, (_, i) => ({
              setNumber: i + 1,
              weight: pe.targetWeight,
              reps: null,
              rpe: null,
              completed: false,
            })),
            notes: pe.notes,
            supersetGroupId: pe.supersetGroupId,
          }))
          setActiveExercises(active)
          setStartTime(new Date())
          setCurrentIndex(0)
          setCurrentSetIndex(0)
          setPhase('active')
        }}
        onCancel={() => navigate('/')}
        restSeconds={restSeconds}
        setRestSeconds={setRestSeconds}
      />
    )
  }

  if (phase === 'celebration' && celebrationData) {
    return <CelebrationView data={celebrationData} onContinue={() => navigate('/')} />
  }

  // Active phase
  return (
    <ActiveView
      exercises={activeExercises}
      setExercises={setActiveExercises}
      currentIndex={currentIndex}
      setCurrentIndex={setCurrentIndex}
      currentSetIndex={currentSetIndex}
      setCurrentSetIndex={setCurrentSetIndex}
      showExerciseList={showExerciseList}
      setShowExerciseList={setShowExerciseList}
      initialRestSeconds={restSeconds}
      startTime={startTime!}
      workoutName={workoutName}
      weightUnit={user.preferences.weightUnit}
      isSaving={isSaving}
      onFinish={async () => {
        setIsSaving(true)
        try {
          const duration = Math.floor((Date.now() - startTime!.getTime()) / 1000 / 60)
          const finalName = workoutName || 'Planned Workout'
          const workoutId = generateId()

          const workout: Workout = {
            id: workoutId,
            userId: user.id,
            weekId: null,
            workoutType: 'quick_log',
            dayOfWeek: new Date().getDay(),
            scheduledDate: new Date(),
            completedAt: new Date(),
            status: 'completed',
            name: finalName,
            totalDuration: duration,
            coachingNotes: [],
            skipReason: null,
          }
          await db.workouts.add(workout)

          let totalSets = 0
          for (const entry of activeExercises) {
            const completedSets = entry.sets.filter(s => s.completed || (s.weight != null && s.reps != null))
            totalSets += completedSets.length

            const logEntry: QuickLogEntry = {
              id: generateId(),
              workoutId,
              exerciseId: entry.exercise.id,
              exerciseName: entry.exercise.name,
              order: activeExercises.indexOf(entry),
              sets: entry.sets.map(s => ({
                setNumber: s.setNumber,
                weight: s.weight,
                reps: s.reps,
                duration: null,
                distance: null,
                rpe: s.rpe,
                completed: s.completed || (s.weight != null && s.reps != null),
              })),
              notes: entry.notes,
              supersetGroupId: entry.supersetGroupId,
            }
            await db.quickLogEntries.add(logEntry)

            for (const set of entry.sets) {
              if ((set.completed || (set.weight != null && set.reps != null)) && set.weight && set.reps) {
                const { checkAndRecordPR } = await import('@/db')
                await checkAndRecordPR(user.id, entry.exercise.id, set.weight, set.reps, set.rpe)
              }
            }
          }

          const streakAchievements = await updateStreakOnWorkoutComplete(user.id)
          const timeAchievements = await checkTimeBasedAchievements(user.id)
          const updatedUser = await getCurrentUser()

          setCelebrationData({
            workoutName: finalName,
            totalSets,
            totalExercises: activeExercises.length,
            duration,
            streak: updatedUser?.currentStreak ?? 1,
            newAchievements: [...streakAchievements, ...timeAchievements],
          })
          setPhase('celebration')
        } catch (error) {
          console.error('Failed to save workout:', error)
        }
        setIsSaving(false)
      }}
      onDiscard={() => navigate('/')}
    />
  )
}

// ============================================================================
// Planning View
// ============================================================================

function PlanningView({
  workoutName,
  setWorkoutName,
  exercises,
  setExercises,
  weightUnit,
  onStart,
  onCancel,
  restSeconds,
  setRestSeconds,
}: {
  workoutName: string
  setWorkoutName: (n: string) => void
  exercises: PlannedExercise[]
  setExercises: React.Dispatch<React.SetStateAction<PlannedExercise[]>>
  weightUnit: 'lbs' | 'kg'
  onStart: () => void
  onCancel: () => void
  restSeconds: number
  setRestSeconds: (n: number) => void
}) {
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const customExercises = useLiveQuery(() => getCustomExercises(), [])

  const filteredExercises = useMemo(() => {
    const customs = customExercises || []
    let results = [...EXERCISE_LIBRARY, ...customs].filter(ex => ex.category !== 'cardio')
    if (searchQuery) {
      results = searchExercises(searchQuery, customs).filter(ex => ex.category !== 'cardio')
    }
    if (selectedCategory) {
      results = results.filter(ex =>
        ex.primaryMuscles.some(m => m.toLowerCase() === selectedCategory.toLowerCase())
      )
    }
    return results.slice(0, 50)
  }, [searchQuery, selectedCategory, customExercises])

  const muscleGroups = [
    'Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings',
    'Glutes', 'Biceps', 'Triceps', 'Core', 'Calves',
  ]

  const addExercise = (exercise: Exercise) => {
    setExercises(prev => [
      ...prev,
      {
        id: generateId(),
        exercise,
        order: prev.length,
        targetSets: 3,
        targetReps: null,
        targetWeight: null,
        notes: '',
      },
    ])
    setShowSearch(false)
    setSearchQuery('')
    setSelectedCategory(null)
  }

  const updateExercise = (id: string, updates: Partial<PlannedExercise>) => {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
  }

  const removeExercise = (id: string) => {
    setExercises(prev => {
      const filtered = prev.filter(e => e.id !== id)
      // Dissolve single-member supersets
      const groupCounts = new Map<string, number>()
      filtered.forEach(e => {
        if (e.supersetGroupId) groupCounts.set(e.supersetGroupId, (groupCounts.get(e.supersetGroupId) || 0) + 1)
      })
      return filtered.map(e => {
        if (e.supersetGroupId && (groupCounts.get(e.supersetGroupId) || 0) <= 1) {
          return { ...e, supersetGroupId: undefined }
        }
        return e
      })
    })
  }

  const linkSuperset = (id: string) => {
    const idx = exercises.findIndex(e => e.id === id)
    if (idx === -1 || idx >= exercises.length - 1) return
    const groupId = exercises[idx].supersetGroupId || exercises[idx + 1].supersetGroupId || generateId()
    setExercises(prev => prev.map((e, i) => {
      if (i === idx || i === idx + 1) return { ...e, supersetGroupId: groupId }
      return e
    }))
  }

  const unlinkSuperset = (groupId: string) => {
    setExercises(prev => prev.map(e =>
      e.supersetGroupId === groupId ? { ...e, supersetGroupId: undefined } : e
    ))
  }

  // Group exercises for display
  const renderGroups = useMemo(() => {
    const groups: Array<{ type: 'single'; exercise: PlannedExercise } | { type: 'superset'; groupId: string; exercises: PlannedExercise[] }> = []
    let i = 0
    while (i < exercises.length) {
      const ex = exercises[i]
      if (ex.supersetGroupId) {
        const groupId = ex.supersetGroupId
        const grouped: PlannedExercise[] = [ex]
        while (i + 1 < exercises.length && exercises[i + 1].supersetGroupId === groupId) {
          i++
          grouped.push(exercises[i])
        }
        groups.push({ type: 'superset', groupId, exercises: grouped })
      } else {
        groups.push({ type: 'single', exercise: ex })
      }
      i++
    }
    return groups
  }, [exercises])

  return (
    <div className="min-h-screen bg-background pb-32 safe-area-inset">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/30 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <input
            className="flex-1 text-xl font-black bg-transparent border-none focus:outline-none text-foreground placeholder:text-muted-foreground/40 min-w-0"
            placeholder="Name your workout…"
            value={workoutName}
            onChange={e => setWorkoutName(e.target.value)}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-lg">
              {exercises.length} exercises
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Plan your workout — clock starts when you tap Start</p>
      </div>

      {/* Exercise List */}
      <div className="p-4 space-y-3">
        {renderGroups.map((group) => {
          if (group.type === 'superset') {
            return (
              <div key={group.groupId} className="rounded-2xl border-l-4 border-primary bg-primary/5 border-y border-r border-primary/20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-primary/15">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest text-primary">Superset</span>
                  </div>
                  <button
                    onClick={() => unlinkSuperset(group.groupId)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
                  >
                    Unlink
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  {group.exercises.map(pe => (
                    <PlanExerciseCard
                      key={pe.id}
                      exercise={pe}
                      weightUnit={weightUnit}
                      onUpdate={updateExercise}
                      onRemove={removeExercise}
                      showLinkButton={false}
                      onLink={() => {}}
                    />
                  ))}
                </div>
              </div>
            )
          }
          const pe = group.exercise
          const idx = exercises.findIndex(e => e.id === pe.id)
          return (
            <PlanExerciseCard
              key={pe.id}
              exercise={pe}
              weightUnit={weightUnit}
              onUpdate={updateExercise}
              onRemove={removeExercise}
              showLinkButton={idx < exercises.length - 1 && !exercises[idx + 1]?.supersetGroupId}
              onLink={() => linkSuperset(pe.id)}
            />
          )
        })}

        {/* Add Exercise */}
        <button
          onClick={() => setShowSearch(true)}
          className="w-full h-14 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-semibold text-sm hover:bg-primary/5 hover:border-primary/50 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v16m8-8H4" />
          </svg>
          Add Exercise
        </button>

        {/* Rest Timer Setting */}
        {exercises.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-secondary/50 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-foreground">Rest Timer</p>
              <p className="text-xs text-muted-foreground">Between sets ({MIN_REST_SECONDS}–{MAX_REST_SECONDS}s)</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRestSeconds(Math.max(MIN_REST_SECONDS, restSeconds - 15))}
                className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-foreground font-bold"
              >-</button>
              <span className="text-sm font-bold font-mono w-10 text-center">{restSeconds}s</span>
              <button
                onClick={() => setRestSeconds(Math.min(MAX_REST_SECONDS, restSeconds + 15))}
                className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-foreground font-bold"
              >+</button>
            </div>
          </div>
        )}
      </div>

      {/* Search Overlay */}
      {showSearch && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowSearch(false); setSearchQuery(''); setSelectedCategory(null) }} />
          <div className="relative bg-card rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up">
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-border/60" />
            </div>
            <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
              <h2 className="text-lg font-black text-foreground">Add Exercise</h2>
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSelectedCategory(null) }} className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="relative mx-4 mb-3 flex-shrink-0">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input
                className="w-full h-11 bg-input border border-border/50 rounded-xl pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/50 transition-colors"
                placeholder="Search exercises…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2 overflow-x-auto px-4 pb-3 flex-shrink-0 scrollbar-hide">
              {muscleGroups.map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedCategory(selectedCategory === m.toLowerCase() ? null : m.toLowerCase())}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0',
                    selectedCategory === m.toLowerCase() ? 'bg-primary text-white shadow-glow-sm' : 'bg-secondary text-muted-foreground'
                  )}
                >{m}</button>
              ))}
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-1.5">
              {filteredExercises.map(exercise => (
                <button
                  key={exercise.id}
                  onClick={() => addExercise(exercise)}
                  className="w-full text-left p-3.5 rounded-xl bg-background border border-border/40 hover:border-primary/40 hover:bg-secondary/30 active:scale-[0.98] transition-all duration-150"
                >
                  <p className="font-semibold text-sm text-foreground">{exercise.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{exercise.primaryMuscles.join(', ')} · {exercise.category}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent safe-area-bottom">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button
            className="flex-[2]"
            size="lg"
            onClick={onStart}
            disabled={exercises.length === 0}
          >
            Start Workout
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Plan Exercise Card
// ============================================================================

function PlanExerciseCard({
  exercise,
  weightUnit,
  onUpdate,
  onRemove,
  showLinkButton,
  onLink,
}: {
  exercise: PlannedExercise
  weightUnit: string
  onUpdate: (id: string, updates: Partial<PlannedExercise>) => void
  onRemove: (id: string) => void
  showLinkButton: boolean
  onLink: () => void
}) {
  return (
    <div className="rounded-2xl bg-card border border-border/40 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-foreground truncate">{exercise.exercise.name}</h3>
          <p className="text-xs text-muted-foreground">{exercise.exercise.primaryMuscles.slice(0, 2).join(', ')}</p>
        </div>
        <button
          onClick={() => onRemove(exercise.id)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Sets</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdate(exercise.id, { targetSets: Math.max(1, exercise.targetSets - 1) })}
              className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center text-foreground text-sm font-bold"
            >-</button>
            <span className="w-6 text-center text-sm font-bold">{exercise.targetSets}</span>
            <button
              onClick={() => onUpdate(exercise.id, { targetSets: exercise.targetSets + 1 })}
              className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center text-foreground text-sm font-bold"
            >+</button>
          </div>
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Target {weightUnit}</label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="—"
            value={exercise.targetWeight ?? ''}
            onChange={e => onUpdate(exercise.id, { targetWeight: e.target.value ? parseFloat(e.target.value) : null })}
            className="w-full h-7 rounded-md bg-secondary/60 border border-border/50 text-center text-sm font-bold text-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Target Reps</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="—"
            value={exercise.targetReps ?? ''}
            onChange={e => onUpdate(exercise.id, { targetReps: e.target.value ? parseInt(e.target.value) : null })}
            className="w-full h-7 rounded-md bg-secondary/60 border border-border/50 text-center text-sm font-bold text-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {/* Actions */}
      {showLinkButton && (
        <div className="mt-2 pt-2 border-t border-border/20">
          <button
            onClick={onLink}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Superset with next
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Active View (Focused Workout Execution)
// ============================================================================

function ActiveView({
  exercises,
  setExercises,
  currentIndex,
  setCurrentIndex,
  currentSetIndex,
  setCurrentSetIndex,
  showExerciseList,
  setShowExerciseList,
  initialRestSeconds,
  startTime,
  workoutName,
  weightUnit,
  isSaving,
  onFinish,
  onDiscard,
}: {
  exercises: ActiveExerciseState[]
  setExercises: React.Dispatch<React.SetStateAction<ActiveExerciseState[]>>
  currentIndex: number
  setCurrentIndex: (n: number) => void
  currentSetIndex: number
  setCurrentSetIndex: (n: number) => void
  showExerciseList: boolean
  setShowExerciseList: (b: boolean) => void
  initialRestSeconds: number
  startTime: Date
  workoutName: string
  weightUnit: string
  isSaving: boolean
  onFinish: () => void
  onDiscard: () => void
}) {
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [isResting, setIsResting] = useState(false)
  const [restTimeLeft, setRestTimeLeft] = useState(0)
  const [restSeconds, setRestSeconds] = useState(initialRestSeconds)

  // Elapsed time ticker
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [startTime])

  // Rest timer
  useEffect(() => {
    if (!isResting || restTimeLeft <= 0) return
    restTimerRef.current = setInterval(() => {
      setRestTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(restTimerRef.current!)
          restTimerRef.current = null
          setIsResting(false)
          triggerRestComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (restTimerRef.current) {
        clearInterval(restTimerRef.current)
        restTimerRef.current = null
      }
    }
  }, [isResting])

  const currentExercise = exercises[currentIndex]
  if (!currentExercise) return null

  // Get the superset group for the current exercise
  const supersetGroup = currentExercise.supersetGroupId
    ? exercises.filter(e => e.supersetGroupId === currentExercise.supersetGroupId)
    : null

  const currentSet = currentExercise.sets[currentSetIndex]

  // Calculate total progress
  const totalSets = exercises.reduce((acc, e) => acc + e.sets.length, 0)
  const completedSets = exercises.reduce((acc, e) => acc + e.sets.filter(s => s.completed).length, 0)
  const progress = totalSets > 0 ? (completedSets / totalSets) * 100 : 0

  const updateCurrentSet = (updates: Partial<ActiveSet>) => {
    setExercises(prev => prev.map((e, i) => {
      if (i !== currentIndex) return e
      const newSets = [...e.sets]
      newSets[currentSetIndex] = { ...newSets[currentSetIndex], ...updates }
      return { ...e, sets: newSets }
    }))
  }

  const completeSet = () => {
    // Mark current set as completed
    updateCurrentSet({ completed: true })

    // Determine what happens next
    if (supersetGroup && supersetGroup.length > 1) {
      // In a superset — cycle to the next exercise in the group
      const currentPosInGroup = supersetGroup.findIndex(e => e.id === currentExercise.id)
      const nextPosInGroup = currentPosInGroup + 1

      if (nextPosInGroup < supersetGroup.length) {
        // Move to next exercise in superset (no rest)
        const nextExIndex = exercises.findIndex(e => e.id === supersetGroup[nextPosInGroup].id)
        setCurrentIndex(nextExIndex)
        setCurrentSetIndex(currentSetIndex) // Same set number in the next exercise
      } else {
        // Completed one round of the superset — rest, then start next round
        const hasMoreSets = currentSetIndex + 1 < currentExercise.sets.length
        if (hasMoreSets) {
          // Start rest, then begin next round from first exercise in superset
          startRest(SUPERSET_REST_SECONDS)
          // After rest, we'll go to first exercise, next set
          const firstInGroup = exercises.findIndex(e => e.id === supersetGroup[0].id)
          // We'll advance after rest via the navigation
          setTimeout(() => {
            setCurrentIndex(firstInGroup)
            setCurrentSetIndex(currentSetIndex + 1)
          }, 0)
        } else {
          // Superset fully complete — move to next exercise/group
          advanceToNextExercise()
        }
      }
    } else {
      // Not in superset — rest then next set or next exercise
      const hasMoreSets = currentSetIndex + 1 < currentExercise.sets.length
      if (hasMoreSets) {
        startRest(restSeconds)
        setCurrentSetIndex(currentSetIndex + 1)
      } else {
        advanceToNextExercise()
      }
    }
  }

  const startRest = (seconds: number) => {
    setRestTimeLeft(seconds)
    setIsResting(true)
  }

  const skipRest = () => {
    if (restTimerRef.current) clearInterval(restTimerRef.current)
    restTimerRef.current = null
    setIsResting(false)
    setRestTimeLeft(0)
  }

  const advanceToNextExercise = () => {
    // Find the next exercise that isn't in the current superset group
    let nextIdx = currentIndex + 1
    if (supersetGroup) {
      const lastInGroup = exercises.findIndex(e => e.id === supersetGroup[supersetGroup.length - 1].id)
      nextIdx = lastInGroup + 1
    }
    if (nextIdx < exercises.length) {
      // No rest between exercises — go straight to next
      setCurrentIndex(nextIdx)
      setCurrentSetIndex(0)
    }
    // If no more exercises, user will see all sets complete and can finish
  }

  const jumpToExercise = (idx: number) => {
    setCurrentIndex(idx)
    // Find the first incomplete set
    const ex = exercises[idx]
    const firstIncomplete = ex.sets.findIndex(s => !s.completed)
    setCurrentSetIndex(firstIncomplete >= 0 ? firstIncomplete : 0)
    setShowExerciseList(false)
    skipRest()
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const allComplete = completedSets === totalSets && totalSets > 0

  return (
    <div className="min-h-screen bg-background safe-area-inset flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowDiscardConfirm(true)} className="text-muted-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <p className="text-sm font-bold text-foreground">{workoutName || 'Workout'}</p>
            <p className="text-xs text-muted-foreground font-mono">{formatTime(elapsed)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExerciseList(true)}
            className="px-3 py-1.5 rounded-lg bg-secondary text-xs font-semibold text-foreground"
          >
            {currentIndex + 1}/{exercises.length}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-secondary/30">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {isResting ? (
          /* Rest Timer Screen */
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Rest</p>
            <div className="relative w-48 h-48 flex items-center justify-center">
              {/* Circular progress */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary/30" />
                <circle
                  cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="3"
                  className="text-primary"
                  strokeDasharray={`${2 * Math.PI * 45}`}
                  strokeDashoffset={`${2 * Math.PI * 45 * (1 - restTimeLeft / restSeconds)}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-5xl font-black font-mono text-foreground">{formatTime(restTimeLeft)}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-4">Next up: {exercises[currentIndex]?.exercise.name}</p>

            {/* Rest time adjustments */}
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => { setRestTimeLeft(t => Math.max(0, t - 15)); setRestSeconds(Math.max(MIN_REST_SECONDS, restSeconds - 15)) }}
                className="px-3 py-2 rounded-xl bg-secondary text-sm font-bold text-foreground"
              >-15s</button>
              <button
                onClick={skipRest}
                className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-bold"
              >Skip</button>
              <button
                onClick={() => { setRestTimeLeft(t => t + 15); setRestSeconds(Math.min(MAX_REST_SECONDS, restSeconds + 15)) }}
                className="px-3 py-2 rounded-xl bg-secondary text-sm font-bold text-foreground"
              >+15s</button>
            </div>
          </div>
        ) : (
          /* Active Exercise */
          <div className="flex-1 flex flex-col px-4 pt-6">
            {/* Superset indicator */}
            {supersetGroup && supersetGroup.length > 1 && (
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-bold text-primary uppercase tracking-widest">
                  Superset ({supersetGroup.findIndex(e => e.id === currentExercise.id) + 1}/{supersetGroup.length})
                </span>
              </div>
            )}

            {/* Exercise Name */}
            <h1 className="text-2xl font-black text-foreground mb-1">{currentExercise.exercise.name}</h1>
            <p className="text-sm text-muted-foreground mb-6">
              {currentExercise.exercise.primaryMuscles.slice(0, 2).join(', ')}
            </p>

            {/* Set Counter */}
            <div className="flex items-center gap-3 mb-6">
              {currentExercise.sets.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSetIndex(i)}
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all',
                    s.completed
                      ? 'bg-success text-white'
                      : i === currentSetIndex
                        ? 'bg-primary text-white ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
                        : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {s.completed ? '✓' : i + 1}
                </button>
              ))}
            </div>

            {/* Current Set Inputs */}
            {currentSet && (
              <div className="rounded-2xl bg-card border border-border/40 p-5 mb-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                  Set {currentSetIndex + 1} of {currentExercise.sets.length}
                </p>

                <div className="grid grid-cols-3 gap-4 mb-5">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5 text-center">
                      {weightUnit}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder={currentSet.weight?.toString() || '—'}
                      value={currentSet.weight ?? ''}
                      onChange={e => updateCurrentSet({ weight: e.target.value ? parseFloat(e.target.value) : null })}
                      className="w-full h-14 rounded-xl bg-secondary/60 border border-border/50 text-center text-2xl font-black text-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5 text-center">Reps</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="—"
                      value={currentSet.reps ?? ''}
                      onChange={e => updateCurrentSet({ reps: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full h-14 rounded-xl bg-secondary/60 border border-border/50 text-center text-2xl font-black text-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5 text-center">RPE</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={10}
                      placeholder="—"
                      value={currentSet.rpe ?? ''}
                      onChange={e => updateCurrentSet({ rpe: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full h-14 rounded-xl bg-secondary/60 border border-border/50 text-center text-2xl font-black text-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                {/* Complete Set Button */}
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-black"
                  onClick={completeSet}
                  disabled={currentSet.completed}
                >
                  {currentSet.completed ? 'Set Complete ✓' : 'Done'}
                </Button>
              </div>
            )}

            {/* All Done State */}
            {allComplete && (
              <div className="text-center py-6">
                <span className="text-5xl mb-3 block">🎉</span>
                <p className="text-lg font-black text-foreground">All Sets Complete!</p>
                <p className="text-sm text-muted-foreground mt-1">Tap Finish to save your workout.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Action */}
      {!isResting && (
        <div className="px-4 pb-6 pt-3 safe-area-bottom">
          <Button
            size="lg"
            className="w-full"
            variant={allComplete ? 'default' : 'outline'}
            onClick={() => allComplete ? onFinish() : setShowFinishConfirm(true)}
            disabled={isSaving}
            loading={isSaving}
          >
            {allComplete ? 'Finish Workout' : 'Finish Early'}
          </Button>
        </div>
      )}

      {/* Exercise List Overlay */}
      {showExerciseList && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowExerciseList(false)} />
          <div className="relative bg-card rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col animate-slide-up">
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-border/60" />
            </div>
            <div className="px-4 pb-3 flex-shrink-0">
              <h2 className="text-lg font-black text-foreground">Exercises</h2>
              <p className="text-xs text-muted-foreground">Tap to jump to an exercise</p>
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-2">
              {exercises.map((ex, i) => {
                const setsCompleted = ex.sets.filter(s => s.completed).length
                const isActive = i === currentIndex
                return (
                  <button
                    key={ex.id}
                    onClick={() => jumpToExercise(i)}
                    className={cn(
                      'w-full text-left p-3.5 rounded-xl border transition-all',
                      isActive
                        ? 'border-primary bg-primary/10'
                        : setsCompleted === ex.sets.length
                          ? 'border-success/30 bg-success/5'
                          : 'border-border/40 bg-background'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{ex.exercise.name}</p>
                        <p className="text-xs text-muted-foreground">{setsCompleted}/{ex.sets.length} sets</p>
                      </div>
                      {setsCompleted === ex.sets.length && (
                        <span className="text-success text-lg">✓</span>
                      )}
                      {isActive && setsCompleted < ex.sets.length && (
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Active</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Finish Early Confirm */}
      {showFinishConfirm && (
        <ConfirmOverlay
          title="Finish Early?"
          message={`You've completed ${completedSets}/${totalSets} sets. Save what you have?`}
          confirmLabel="Save & Finish"
          cancelLabel="Keep Going"
          onConfirm={() => { setShowFinishConfirm(false); onFinish() }}
          onCancel={() => setShowFinishConfirm(false)}
        />
      )}

      {/* Discard Confirm */}
      {showDiscardConfirm && (
        <ConfirmOverlay
          title="Discard Workout?"
          message="All progress will be lost."
          confirmLabel="Discard"
          cancelLabel="Keep Going"
          destructive
          onConfirm={onDiscard}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function triggerRestComplete() {
  // Vibrate if supported
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200])
  }
  // Play a short beep sound
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.3
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
    setTimeout(() => {
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.frequency.value = 1100
      gain2.gain.value = 0.3
      osc2.start()
      osc2.stop(ctx.currentTime + 0.2)
    }, 200)
  } catch {
    // Audio not available
  }
}

function ConfirmOverlay({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="w-full max-w-sm bg-card border border-border/50 rounded-3xl p-6 shadow-2xl animate-slide-up mb-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black text-foreground mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{message}</p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 font-bold" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} className="flex-1 font-bold" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Celebration
// ============================================================================

interface CelebrationData {
  workoutName: string
  totalSets: number
  totalExercises: number
  duration: number
  streak: number
  newAchievements: AchievementId[]
}

function CelebrationView({ data, onContinue }: { data: CelebrationData; onContinue: () => void }) {
  const isOnFire = data.streak >= 3
  const streakMessage = getStreakMessage(data.streak)

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center safe-area-inset">
      <div className="mb-6 animate-float">
        <span className="text-7xl">{isOnFire ? '🔥' : '💪'}</span>
      </div>

      <h1 className="text-4xl font-black tracking-tight mb-1 animate-slide-up">CRUSHED IT!</h1>
      <p className="text-muted-foreground mb-8 animate-slide-up">{data.workoutName} complete</p>

      <div className={cn(
        'w-full max-w-sm mb-5 rounded-2xl border p-6 animate-slide-up',
        isOnFire ? 'border-primary/40 bg-gradient-to-br from-primary/10 to-transparent shadow-glow' : 'border-border/50 bg-card shadow-card'
      )}>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-4xl font-black font-mono text-primary">{data.totalSets}</div>
            <p className="text-xs text-muted-foreground mt-1">sets</p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black font-mono text-foreground">{data.totalExercises}</div>
            <p className="text-xs text-muted-foreground mt-1">exercises</p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black font-mono text-foreground">{data.duration}</div>
            <p className="text-xs text-muted-foreground mt-1">min</p>
          </div>
        </div>
      </div>

      <div className={cn(
        'w-full max-w-sm mb-6 rounded-2xl border p-5 animate-slide-up',
        isOnFire ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-card'
      )}>
        <div className={cn('text-5xl font-black font-mono text-center', isOnFire ? 'text-primary' : 'text-foreground')}>
          {data.streak}
        </div>
        <p className="text-sm text-muted-foreground text-center mt-1">day streak</p>
        <p className="text-xs text-muted-foreground text-center mt-2">{streakMessage}</p>
      </div>

      {data.newAchievements.length > 0 && (
        <div className="w-full max-w-sm mb-6">
          <p className="text-xs font-bold text-primary uppercase tracking-widest mb-3">Achievement{data.newAchievements.length > 1 ? 's' : ''} Unlocked!</p>
          <div className="space-y-2">
            {data.newAchievements.map(id => {
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

      <Button size="lg" onClick={onContinue} className="w-full max-w-sm">Continue</Button>
    </div>
  )
}
