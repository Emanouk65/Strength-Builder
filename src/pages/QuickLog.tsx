import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  getCurrentUser,
  updateStreakOnWorkoutComplete,
  checkTimeBasedAchievements,
  getLastWorkoutForExercise,
  getBestLift,
  addCustomExercise,
  getCustomExercises,
} from '@/db'
import { EXERCISE_LIBRARY, searchExercises, generateQuickWorkout, getExerciseAlternative } from '@/db/exercises'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { cn, generateId, formatDuration, getSuggestedWeight, getExerciseLogFields, type LogFieldType } from '@/lib/utils'
import { ACHIEVEMENTS, getStreakMessage, QUICK_WORKOUT_TEMPLATES, type QuickWorkoutType } from '@/lib/constants'
import type {
  Workout,
  QuickLogEntry,
  QuickLogSet,
  Exercise,
  CardioWorkoutData,
  CardioType,
  AchievementId,
  LiftRecord,
} from '@/lib/types'

// ============================================================================
// QuickLog Page
// ============================================================================

export function QuickLog() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())
  const [mode, setMode] = useState<'initial' | 'select' | 'template' | 'strength' | 'cardio'>('initial')
  const [selectedTemplate, setSelectedTemplate] = useState<QuickWorkoutType | null>(null)
  const [, setWorkoutStarted] = useState(false)
  const [workoutId, setWorkoutId] = useState<string | null>(null)
  const [entries, setEntries] = useState<QuickLogEntryState[]>([])
  const [cardioData, setCardioData] = useState<CardioWorkoutData | null>(null)
  const [workoutName, setWorkoutName] = useState('')
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationData, setCelebrationData] = useState<{
    workoutId: string
    workoutName: string
    totalSets: number
    totalExercises: number
    duration: number
    streak: number
    totalWorkouts: number
    newAchievements: AchievementId[]
    isCardio: boolean
    cardioStats?: { distance: number | null; duration: number; cardioType: string }
  } | null>(null)

  // ── Restore in-progress session on mount ──────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('ql_session')
    if (!saved) return
    try {
      const d = JSON.parse(saved)
      if (d.workoutId && Array.isArray(d.entries) && d.entries.length > 0) {
        setMode(d.mode ?? 'strength')
        setWorkoutId(d.workoutId)
        setWorkoutName(d.workoutName ?? '')
        setEntries(d.entries)
        setStartTime(d.startTime ? new Date(d.startTime) : new Date())
        if (d.selectedTemplate) setSelectedTemplate(d.selectedTemplate)
        setWorkoutStarted(true)
      }
    } catch { /* ignore corrupt data */ }
  }, [])

  // ── Auto-save session to localStorage on every change ─────────────────────
  useEffect(() => {
    if ((mode !== 'strength' && mode !== 'template') || !workoutId) return
    localStorage.setItem('ql_session', JSON.stringify({
      mode, workoutId, workoutName, startTime, entries, selectedTemplate,
    }))
  }, [entries, workoutId, workoutName, mode, startTime, selectedTemplate])

  const clearSession = () => localStorage.removeItem('ql_session')

  const startTemplateWorkout = (templateType: QuickWorkoutType) => {
    if (!user) return
    const template = QUICK_WORKOUT_TEMPLATES[templateType]
    const exercises = generateQuickWorkout(templateType, user.preferences.equipmentAccess, user.injuryProfile)
    const generatedEntries: QuickLogEntryState[] = exercises.map((exercise, index) => ({
      id: generateId(),
      exercise,
      order: index,
      sets: Array.from({ length: template.setsPerExercise }, (_, i) => ({
        setNumber: i + 1,
        weight: null,
        reps: null,
        duration: null,
        distance: null,
        rpe: null,
        completed: false,
      })),
      notes: '',
    }))
    setSelectedTemplate(templateType)
    setWorkoutName(template.name)
    setEntries(generatedEntries)
    setMode('template')
    setWorkoutStarted(true)
    setStartTime(new Date())
    setWorkoutId(generateId())
  }

  const swapExercise = (entryId: string) => {
    if (!user) return
    const entry = entries.find(e => e.id === entryId)
    if (!entry) return
    const usedIds = entries.map(e => e.exercise.id)
    const alternative = getExerciseAlternative(entry.exercise, usedIds, user.preferences.equipmentAccess, user.injuryProfile)
    if (alternative) {
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, exercise: alternative } : e))
    }
  }

  const startWorkout = (type: 'strength' | 'cardio') => {
    setMode(type)
    setWorkoutStarted(true)
    setStartTime(new Date())
    setWorkoutId(generateId())
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

  const getDuration = () => {
    if (!startTime) return 0
    return Math.floor((new Date().getTime() - startTime.getTime()) / 1000 / 60)
  }

  const saveWorkout = async () => {
    if (!user || !workoutId) return
    clearSession()
    setIsSaving(true)
    try {
      const finalWorkoutName = workoutName || (mode === 'cardio' ? `${cardioData?.cardioType || 'Cardio'} Session` : 'Quick Log')
      const duration = getDuration()
      const workout: Workout = {
        id: workoutId,
        userId: user.id,
        weekId: null,
        workoutType: mode === 'cardio' ? 'cardio' : 'quick_log',
        dayOfWeek: new Date().getDay(),
        scheduledDate: new Date(),
        completedAt: new Date(),
        status: 'completed',
        name: finalWorkoutName,
        totalDuration: duration,
        coachingNotes: [],
        skipReason: null,
        cardioData: mode === 'cardio' ? cardioData || undefined : undefined,
      }
      await db.workouts.add(workout)

      let totalSets = 0
      let totalExercises = 0

      if (mode === 'strength' || mode === 'template') {
        totalExercises = entries.length
        for (const entry of entries) {
          // Count sets that have any data (weight or reps) as "completed" for stats
          const loggedSets = entry.sets.filter(s => s.completed || (s.weight != null && s.reps != null))
          // Mark those sets as completed before saving
          const normalizedSets = entry.sets.map(s => ({
            ...s,
            completed: s.completed || (s.weight != null && s.reps != null),
          }))
          totalSets += loggedSets.length

          const logEntry: QuickLogEntry = {
            id: generateId(),
            workoutId: workoutId,
            exerciseId: entry.exercise.id,
            exerciseName: entry.exercise.name,
            order: entry.order,
            sets: normalizedSets,
            notes: entry.notes,
            supersetGroupId: entry.supersetGroupId,
          }
          await db.quickLogEntries.add(logEntry)

          for (const set of normalizedSets) {
            if (set.completed && set.weight && set.reps) {
              const { checkAndRecordPR } = await import('@/db')
              await checkAndRecordPR(user.id, entry.exercise.id, set.weight, set.reps, set.rpe)
            }
          }
        }
      }

      const streakAchievements = await updateStreakOnWorkoutComplete(user.id)
      const timeAchievements = await checkTimeBasedAchievements(user.id)
      const updatedUser = await getCurrentUser()

      setCelebrationData({
        workoutId: workoutId,
        workoutName: finalWorkoutName,
        totalSets,
        totalExercises,
        duration,
        streak: updatedUser?.currentStreak ?? 1,
        totalWorkouts: updatedUser?.totalWorkoutsCompleted ?? 1,
        newAchievements: [...streakAchievements, ...timeAchievements],
        isCardio: mode === 'cardio',
        cardioStats: mode === 'cardio' && cardioData ? {
          distance: cardioData.distance,
          duration: cardioData.duration,
          cardioType: cardioData.cardioType,
        } : undefined,
      })
      setShowCelebration(true)
      setIsSaving(false)
    } catch (error) {
      console.error('Failed to save workout:', error)
      setIsSaving(false)
    }
  }

  if (!user) return null

  if (showCelebration && celebrationData) {
    return <QuickLogCelebration data={celebrationData} onContinue={() => navigate('/')} />
  }

  if (mode === 'initial') {
    return (
      <div className="min-h-screen bg-background p-4 safe-area-inset">
        <header className="mb-6 pt-2">
          <h1 className="text-3xl font-black tracking-tight text-foreground">Start Workout</h1>
          <p className="text-muted-foreground mt-1 text-sm">Pick a template or build your own</p>
        </header>

        {/* Split-based workouts */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">By Muscle Group</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(QUICK_WORKOUT_TEMPLATES) as [QuickWorkoutType, typeof QUICK_WORKOUT_TEMPLATES[QuickWorkoutType]][])
              .filter(([_, t]) => t.category === 'split')
              .map(([type, template]) => (
                <button
                  key={type}
                  onClick={() => startTemplateWorkout(type)}
                  className="p-3.5 rounded-2xl bg-card border border-border/60 hover:border-primary/50 hover:bg-card/80 transition-all duration-200 text-center press-feedback"
                >
                  <span className="text-2xl block mb-1.5">{template.icon}</span>
                  <span className="text-xs font-semibold text-foreground block">{template.name}</span>
                </button>
              ))}
          </div>
        </div>

        {/* Goal-based workouts */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">By Goal</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(QUICK_WORKOUT_TEMPLATES) as [QuickWorkoutType, typeof QUICK_WORKOUT_TEMPLATES[QuickWorkoutType]][])
              .filter(([_, t]) => t.category === 'goal')
              .map(([type, template]) => (
                <button
                  key={type}
                  onClick={() => startTemplateWorkout(type)}
                  className="p-4 rounded-2xl bg-card border border-border/60 hover:border-primary/50 transition-all duration-200 text-left flex items-center gap-3 press-feedback"
                >
                  <span className="text-2xl flex-shrink-0">{template.icon}</span>
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-foreground block">{template.name}</span>
                    <span className="text-xs text-muted-foreground truncate block">{template.description}</span>
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Build your own */}
        <div className="border-t border-border/50 pt-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Build Your Own</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setMode('select'); startWorkout('strength') }}
              className="p-5 rounded-2xl bg-card border border-border/60 hover:border-primary/50 transition-all duration-200 text-center press-feedback"
            >
              <span className="text-3xl block mb-2">🏋️</span>
              <p className="font-semibold text-sm">Strength</p>
              <p className="text-xs text-muted-foreground mt-0.5">Custom lifts</p>
            </button>
            <button
              onClick={() => { setMode('select'); startWorkout('cardio') }}
              className="p-5 rounded-2xl bg-card border border-border/60 hover:border-primary/50 transition-all duration-200 text-center press-feedback"
            >
              <span className="text-3xl block mb-2">🏃</span>
              <p className="font-semibold text-sm">Cardio</p>
              <p className="text-xs text-muted-foreground mt-0.5">Run, bike, swim…</p>
            </button>
          </div>
        </div>

        <Button variant="ghost" className="w-full mt-6 text-muted-foreground" onClick={() => navigate('/')}>
          Cancel
        </Button>
      </div>
    )
  }

  if (mode === 'template' && selectedTemplate) {
    const template = QUICK_WORKOUT_TEMPLATES[selectedTemplate]
    return (
      <WorkoutLogger
        entries={entries}
        setEntries={setEntries}
        workoutName={workoutName}
        setWorkoutName={setWorkoutName}
        onSave={saveWorkout}
        onCancel={() => { clearSession(); navigate('/') }}
        isSaving={isSaving}
        duration={getDuration()}
        weightUnit={user?.preferences.weightUnit || 'lbs'}
        repRange={template.repRange}
        onSwapExercise={swapExercise}
        userId={user?.id}
      />
    )
  }

  if (mode === 'cardio' && cardioData) {
    return (
      <CardioLogger
        data={cardioData}
        setData={setCardioData}
        workoutName={workoutName}
        setWorkoutName={setWorkoutName}
        onSave={saveWorkout}
        onCancel={() => { clearSession(); navigate('/') }}
        isSaving={isSaving}
        distanceUnit={user.preferences.weightUnit === 'lbs' ? 'miles' : 'km'}
      />
    )
  }

  // Free-form strength logging
  return (
    <WorkoutLogger
      entries={entries}
      setEntries={setEntries}
      workoutName={workoutName}
      setWorkoutName={setWorkoutName}
      onSave={saveWorkout}
      onCancel={() => { clearSession(); navigate('/') }}
      isSaving={isSaving}
      duration={getDuration()}
      weightUnit={user.preferences.weightUnit}
      userId={user.id}
    />
  )
}

// ============================================================================
// Types
// ============================================================================

interface QuickLogEntryState {
  id: string
  exercise: Exercise
  order: number
  sets: QuickLogSet[]
  notes: string
  supersetGroupId?: string
}

// ============================================================================
// Superset Helpers
// ============================================================================

type RenderGroup =
  | { type: 'single'; entry: QuickLogEntryState }
  | { type: 'superset'; groupId: string; entries: QuickLogEntryState[] }

function groupEntriesForRender(entries: QuickLogEntryState[]): RenderGroup[] {
  const groups: RenderGroup[] = []
  let i = 0
  while (i < entries.length) {
    const entry = entries[i]
    if (entry.supersetGroupId) {
      const groupId = entry.supersetGroupId
      const grouped: QuickLogEntryState[] = [entry]
      while (i + 1 < entries.length && entries[i + 1].supersetGroupId === groupId) {
        i++
        grouped.push(entries[i])
      }
      groups.push({ type: 'superset', groupId, entries: grouped })
    } else {
      groups.push({ type: 'single', entry })
    }
    i++
  }
  return groups
}

function createSuperset(
  entries: QuickLogEntryState[],
  entryId: string,
  setEntries: React.Dispatch<React.SetStateAction<QuickLogEntryState[]>>
) {
  const idx = entries.findIndex(e => e.id === entryId)
  if (idx === -1 || idx >= entries.length - 1) return
  const next = entries[idx + 1]
  if (entries[idx].supersetGroupId) return
  const groupId = generateId()
  setEntries(prev =>
    prev.map((e, i) => {
      if (i === idx) return { ...e, supersetGroupId: next.supersetGroupId || groupId }
      if (i === idx + 1) return { ...e, supersetGroupId: next.supersetGroupId || groupId }
      return e
    })
  )
}

function SupersetWrapper({ children, onUnlink }: { children: React.ReactNode; onUnlink: () => void }) {
  return (
    <div className="rounded-2xl border-l-4 border-primary bg-primary/5 border-y border-r border-primary/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-primary/15">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Superset</span>
        </div>
        <button
          onClick={onUnlink}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
        >
          Unlink
        </button>
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  )
}

// ============================================================================
// History & PR Hooks
// ============================================================================

function useExerciseHistory(userId: string | undefined, exerciseIds: string[]) {
  const [history, setHistory] = useState<Record<string, { weight: number; reps: number; rpe: number | null }>>({})

  useEffect(() => {
    if (!userId || exerciseIds.length === 0) return
    const fetchHistory = async () => {
      const results: Record<string, { weight: number; reps: number; rpe: number | null }> = {}
      for (const exerciseId of exerciseIds) {
        if (history[exerciseId]) continue
        const data = await getLastWorkoutForExercise(userId, exerciseId)
        if (data) results[exerciseId] = data
      }
      if (Object.keys(results).length > 0) {
        setHistory(prev => ({ ...prev, ...results }))
      }
    }
    fetchHistory()
  }, [userId, exerciseIds.join(',')])

  return history
}

function useExercisePRs(userId: string | undefined, exerciseIds: string[]) {
  const [prs, setPRs] = useState<Record<string, { weight: number; reps: number }>>({})

  useEffect(() => {
    if (!userId || exerciseIds.length === 0) return
    const fetchPRs = async () => {
      const results: Record<string, { weight: number; reps: number }> = {}
      for (const exerciseId of exerciseIds) {
        if (prs[exerciseId]) continue
        const record: LiftRecord | undefined = await getBestLift(userId, exerciseId)
        if (record) results[exerciseId] = { weight: record.weight, reps: record.reps }
      }
      if (Object.keys(results).length > 0) {
        setPRs(prev => ({ ...prev, ...results }))
      }
    }
    fetchPRs()
  }, [userId, exerciseIds.join(',')])

  return prs
}

// ============================================================================
// Unified Workout Logger
// ============================================================================

function WorkoutLogger({
  entries,
  setEntries,
  workoutName,
  setWorkoutName,
  onSave,
  onCancel,
  isSaving,
  duration,
  weightUnit,
  userId,
  repRange,
  onSwapExercise,
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
  userId?: string
  repRange?: [number, number]
  onSwapExercise?: (entryId: string) => void
}) {
  const [showExerciseSearch, setShowExerciseSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const exerciseIds = useMemo(() => entries.map(e => e.exercise.id), [entries])
  const exerciseHistory = useExerciseHistory(userId, exerciseIds)
  const exercisePRs = useExercisePRs(userId, exerciseIds)
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
  ]

  // ---- State callbacks all use functional form to avoid stale closures ----

  const addExercise = (exercise: Exercise) => {
    const newEntry: QuickLogEntryState = {
      id: generateId(),
      exercise,
      order: entries.length,
      sets: [{ setNumber: 1, weight: null, reps: null, duration: null, distance: null, rpe: null, completed: false }],
      notes: '',
    }
    setEntries(prev => [...prev, { ...newEntry, order: prev.length }])
    setShowExerciseSearch(false)
    setShowCustomForm(false)
    setSearchQuery('')
    setSelectedCategory(null)
  }

  const addSet = (entryId: string) => {
    setEntries(prev =>
      prev.map(e => {
        if (e.id !== entryId) return e
        const last = e.sets[e.sets.length - 1]
        return {
          ...e,
          sets: [
            ...e.sets,
            {
              setNumber: e.sets.length + 1,
              weight: last?.weight || null,
              reps: last?.reps || null,
              duration: null,
              distance: null,
              rpe: null,
              completed: false,
            },
          ],
        }
      })
    )
  }

  const updateSet = (entryId: string, setIndex: number, updates: Partial<QuickLogSet>) => {
    setEntries(prev =>
      prev.map(e => {
        if (e.id !== entryId) return e
        const newSets = [...e.sets]
        newSets[setIndex] = { ...newSets[setIndex], ...updates }
        return { ...e, sets: newSets }
      })
    )
  }

  const removeEntry = (entryId: string) => {
    setEntries(prev => {
      const filtered = prev.filter(e => e.id !== entryId)
      // Dissolve supersets that now have only 1 member
      const groupCounts = new Map<string, number>()
      filtered.forEach(e => {
        if (e.supersetGroupId) {
          groupCounts.set(e.supersetGroupId, (groupCounts.get(e.supersetGroupId) || 0) + 1)
        }
      })
      return filtered.map(e => {
        if (e.supersetGroupId && (groupCounts.get(e.supersetGroupId) || 0) <= 1) {
          return { ...e, supersetGroupId: undefined }
        }
        return e
      })
    })
  }

  const removeSet = (entryId: string, setIndex: number) => {
    setEntries(prev =>
      prev.map(e => {
        if (e.id !== entryId || e.sets.length <= 1) return e
        const newSets = e.sets
          .filter((_, i) => i !== setIndex)
          .map((s, i) => ({ ...s, setNumber: i + 1 }))
        return { ...e, sets: newSets }
      })
    )
  }

  const closeSearch = () => { setShowExerciseSearch(false); setSearchQuery(''); setSelectedCategory(null) }

  const completedSetsTotal = entries.reduce(
    (acc, e) => acc + e.sets.filter(s => s.completed || (s.weight != null && s.reps != null)).length,
    0
  )

  return (
    <div className="min-h-screen bg-background pb-32 safe-area-inset">

      {/* ── Exercise search bottom sheet ───────────────────────────────────── */}
      {showExerciseSearch && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeSearch} />

          {/* Sheet */}
          <div className="relative bg-card rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-border/60" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
              <h2 className="text-lg font-black text-foreground">Add Exercise</h2>
              <button
                onClick={closeSearch}
                className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search input */}
            <div className="relative mx-4 mb-3 flex-shrink-0">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="w-full h-11 bg-input border border-border/50 rounded-xl pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/50 transition-colors"
                placeholder="Search exercises…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Muscle group filters */}
            <div className="flex gap-2 overflow-x-auto px-4 pb-3 flex-shrink-0 scrollbar-hide">
              {muscleGroups.map(muscle => (
                <button
                  key={muscle.id}
                  onClick={() => setSelectedCategory(selectedCategory === muscle.id ? null : muscle.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0',
                    selectedCategory === muscle.id
                      ? 'bg-primary text-white shadow-glow-sm'
                      : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {muscle.label}
                </button>
              ))}
            </div>

            {/* Exercise list — scrollable */}
            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-1.5">
              {filteredExercises.map(exercise => (
                <button
                  key={exercise.id}
                  onClick={() => addExercise(exercise)}
                  className="w-full text-left p-3.5 rounded-xl bg-background border border-border/40 hover:border-primary/40 hover:bg-secondary/30 active:scale-[0.98] transition-all duration-150"
                >
                  <p className="font-semibold text-sm text-foreground">
                    {exercise.name}
                    {exercise.isCustom && <span className="text-primary ml-1.5 text-xs font-normal">(custom)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {exercise.primaryMuscles.join(', ')} · {exercise.category}
                  </p>
                </button>
              ))}

              <button
                onClick={() => setShowCustomForm(true)}
                className="w-full mt-1 h-11 rounded-xl border border-dashed border-primary/40 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
              >
                + Create Custom Exercise
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom exercise form overlay ────────────────────────────────────── */}
      {showCustomForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCustomForm(false)} />
          <div className="relative bg-card rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
            <CreateCustomExerciseForm
              onSave={async exercise => { await addCustomExercise(exercise); addExercise(exercise) }}
              onCancel={() => setShowCustomForm(false)}
            />
          </div>
        </div>
      )}

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
                <h3 className="text-base font-black text-foreground">Discard Workout?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">All progress will be lost.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 font-bold" onClick={() => setShowExitConfirm(false)}>
                Keep Going
              </Button>
              <Button variant="destructive" className="flex-1 font-bold" onClick={onCancel}>
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}

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
            <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-lg">
              {formatDuration(duration)}
            </span>
            {completedSetsTotal > 0 && (
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-lg">
                {completedSetsTotal} sets
              </span>
            )}
          </div>
        </div>
        {repRange && (
          <p className="text-xs text-muted-foreground mt-1">Target: {repRange[0]}–{repRange[1]} reps</p>
        )}
      </div>

      <div className="p-4 space-y-4">
        {groupEntriesForRender(entries).map((group, gi) => {
          if (group.type === 'superset') {
            return (
              <SupersetWrapper
                key={group.groupId}
                onUnlink={() =>
                  setEntries(prev =>
                    prev.map(e =>
                      e.supersetGroupId === group.groupId ? { ...e, supersetGroupId: undefined } : e
                    )
                  )
                }
              >
                {group.entries.map(entry => {
                  const fields = getExerciseLogFields(entry.exercise.movementPattern, entry.exercise.category)
                  const lastData = exerciseHistory[entry.exercise.id]
                  const prData = exercisePRs[entry.exercise.id]
                  const historySuggested = lastData ? getSuggestedWeight(lastData.weight, lastData.reps, lastData.rpe) : undefined
                  const sessionMax = entry.sets.filter(s => s.completed && s.weight != null).reduce<number | null>((m, s) => m === null || s.weight! > m ? s.weight! : m, null)
                  const suggested = sessionMax != null && (historySuggested == null || sessionMax > historySuggested) ? sessionMax : historySuggested
                  return (
                    <ExerciseCard
                      key={entry.id}
                      entry={entry}
                      fields={fields}
                      lastData={lastData}
                      prData={prData}
                      suggested={suggested}
                      weightUnit={weightUnit}
                      updateSet={updateSet}
                      removeSet={removeSet}
                      addSet={addSet}
                      removeEntry={removeEntry}
                      onLink={() => createSuperset(entries, entry.id, setEntries)}
                      onSwapExercise={onSwapExercise}
                      isInSuperset={true}
                      isLastEntry={false}
                      repRange={repRange}
                    />
                  )
                })}
              </SupersetWrapper>
            )
          }

          const entry = group.entry
          const fields = getExerciseLogFields(entry.exercise.movementPattern, entry.exercise.category)
          const lastData = exerciseHistory[entry.exercise.id]
          const prData = exercisePRs[entry.exercise.id]
          const historySuggested = lastData ? getSuggestedWeight(lastData.weight, lastData.reps, lastData.rpe) : undefined
          const sessionMax = entry.sets.filter(s => s.completed && s.weight != null).reduce<number | null>((m, s) => m === null || s.weight! > m ? s.weight! : m, null)
          const suggested = sessionMax != null && (historySuggested == null || sessionMax > historySuggested) ? sessionMax : historySuggested
          const idx = entries.findIndex(e => e.id === entry.id)
          return (
            <div key={entry.id} className={`stagger-${Math.min(gi + 1, 6)}`}>
              <ExerciseCard
                entry={entry}
                fields={fields}
                lastData={lastData}
                prData={prData}
                suggested={suggested}
                weightUnit={weightUnit}
                updateSet={updateSet}
                removeSet={removeSet}
                addSet={addSet}
                removeEntry={removeEntry}
                onLink={() => createSuperset(entries, entry.id, setEntries)}
                onSwapExercise={onSwapExercise}
                isInSuperset={false}
                isLastEntry={idx === entries.length - 1}
                repRange={repRange}
              />
            </div>
          )
        })}

        {/* Add Exercise Button */}
        <button
          onClick={() => setShowExerciseSearch(true)}
          className="w-full h-14 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-semibold text-sm hover:bg-primary/5 hover:border-primary/50 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v16m8-8H4" />
          </svg>
          Add Exercise
        </button>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent safe-area-bottom">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button variant="outline" className="flex-1" onClick={() => setShowExitConfirm(true)}>
            Discard
          </Button>
          <Button
            className="flex-2 flex-1"
            onClick={onSave}
            disabled={entries.length === 0 || isSaving}
            loading={isSaving}
          >
            Finish Workout
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Exercise Card
// ============================================================================

function ExerciseCard({
  entry,
  fields,
  lastData,
  prData,
  suggested,
  weightUnit,
  updateSet,
  removeSet,
  addSet,
  removeEntry,
  onLink,
  onSwapExercise,
  isInSuperset,
  isLastEntry,
  repRange,
}: {
  entry: QuickLogEntryState
  fields: LogFieldType[]
  lastData?: { weight: number; reps: number; rpe: number | null }
  prData?: { weight: number; reps: number }
  suggested?: number
  weightUnit: string
  updateSet: (entryId: string, setIndex: number, updates: Partial<QuickLogSet>) => void
  removeSet: (entryId: string, setIndex: number) => void
  addSet: (entryId: string) => void
  removeEntry: (entryId: string) => void
  onLink: () => void
  onSwapExercise?: (entryId: string) => void
  isInSuperset: boolean
  isLastEntry: boolean
  repRange?: [number, number]
}) {
  const completedCount = entry.sets.filter(s => s.completed).length
  const totalCount = entry.sets.length
  const allDone = completedCount === totalCount && totalCount > 0
  const prWeight = prData?.weight
  const isBeatPR = prWeight && entry.sets.some(s => s.weight != null && s.weight > prWeight)

  // Auto-collapse when all sets done; user can re-expand by tapping header
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { if (allDone) setCollapsed(true) }, [allDone])

  // Only show weight + reps fields (no RPE in the row per user request)
  const rowFields = fields.filter(f => f !== 'rpe')

  return (
    <div className={cn(
      'rounded-2xl overflow-hidden border transition-all duration-200 bg-card',
      allDone ? 'border-success/40' : isBeatPR ? 'border-[#FF6B35]/40' : 'border-border/40'
    )}>
      {/* Header — tap to collapse/expand */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-4 pt-3.5 pb-3 flex items-center justify-between gap-2 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-foreground leading-snug truncate">{entry.exercise.name}</h3>
            {isBeatPR && (
              <span className="text-[10px] font-bold text-[#FF6B35] bg-[#FF6B35]/10 px-1.5 py-0.5 rounded-full flex-shrink-0">🏆 PR!</span>
            )}
            {allDone && !isBeatPR && (
              <span className="text-success text-base flex-shrink-0">✓</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            {allDone
              ? <span className="text-success/80 font-semibold">{completedCount}/{totalCount} sets done</span>
              : completedCount > 0
                ? <span className="font-semibold text-primary">{completedCount}/{totalCount} sets</span>
                : lastData
                  ? <>{lastData.weight}{weightUnit} × {lastData.reps} last time</>
                  : <>{entry.exercise.primaryMuscles.slice(0, 2).join(', ')}</>
            }
            {prData && !allDone && (
              <span className="ml-2 text-[#FF6B35]/80">· PR {prData.weight}{weightUnit}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Mini set dots */}
          <div className="flex gap-0.5 mr-1">
            {entry.sets.map((s, i) => (
              <div key={i} className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors',
                (s.completed || (s.weight != null && s.reps != null)) ? 'bg-success' : 'bg-border'
              )} />
            ))}
          </div>
          {/* Chevron */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={cn('text-muted-foreground transition-transform duration-200', collapsed ? '' : 'rotate-180')}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {!collapsed && (
        <>
          <div className="h-px bg-border/20 mx-4" />

          {/* Set rows */}
          <div className="px-3 pb-3 pt-2.5 space-y-1.5">
            {/* Column headers */}
            <div className="flex items-center gap-1.5 px-2 pb-0.5">
              <span className="w-5 text-[10px] text-center text-muted-foreground/40 font-medium uppercase tracking-wider">#</span>
              {rowFields.map((f, fi, arr) => (
                <React.Fragment key={f}>
                  {fi === 1 && arr.length === 2 && <span className="text-transparent text-xs flex-shrink-0 select-none">×</span>}
                  <span className="w-16 text-[10px] text-center text-muted-foreground/40 font-medium uppercase tracking-wider">
                    {f === 'weight' ? weightUnit : f === 'reps' ? 'Reps' : f === 'duration' ? 'Sec' : 'Dist'}
                  </span>
                </React.Fragment>
              ))}
              <span className="text-[10px] text-center text-muted-foreground/60 font-bold uppercase tracking-wider flex-shrink-0 px-2">Done</span>
              {entry.sets.length > 1 && <span className="w-5" />}
            </div>

            {entry.sets.map((set, setIndex) => (
              <QuickSetRow
                key={setIndex}
                set={set}
                setIndex={setIndex}
                entryId={entry.id}
                fields={rowFields}
                suggestedWeight={suggested ?? prData?.weight}
                repRange={repRange}
                updateSet={updateSet}
                removeSet={removeSet}
                canRemove={entry.sets.length > 1}
              />
            ))}

            <button
              onClick={() => addSet(entry.id)}
              className="w-full h-8 rounded-xl text-xs font-medium text-muted-foreground/60 hover:text-primary hover:bg-primary/5 transition-all duration-200 border border-dashed border-border/30 hover:border-primary/30 mt-1"
            >
              + Add Set
            </button>
          </div>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="h-1 bg-secondary/30">
              <div
                className={cn('h-full transition-all duration-500', allDone ? 'bg-success' : 'bg-primary')}
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          )}
        </>
      )}

      {/* Action buttons (always visible) */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-t border-border/20">
        {onSwapExercise && (
          <button
            onClick={() => onSwapExercise(entry.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            Swap
          </button>
        )}
        {!isInSuperset && !isLastEntry && (
          <button
            onClick={onLink}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Superset
          </button>
        )}
        <button
          onClick={() => removeEntry(entry.id)}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          Remove
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Quick Set Row
// ============================================================================

function QuickSetRow({
  set,
  setIndex,
  entryId,
  fields,
  suggestedWeight,
  repRange,
  updateSet,
  removeSet,
  canRemove,
}: {
  set: QuickLogSet
  setIndex: number
  entryId: string
  fields: LogFieldType[]
  suggestedWeight?: number
  repRange?: [number, number]
  updateSet: (entryId: string, setIndex: number, updates: Partial<QuickLogSet>) => void
  removeSet: (entryId: string, setIndex: number) => void
  canRemove: boolean
}) {
  const isDone = set.completed
  // Only show weight + reps (no RPE in set row)
  const rowFields = fields.filter(f => f !== 'rpe')

  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-xl px-2 py-1 transition-all duration-200',
      isDone ? 'bg-success/10 border border-success/20' : 'border border-transparent'
    )}>
      {/* Set number */}
      <span className={cn(
        'w-5 text-center text-xs font-bold font-mono flex-shrink-0',
        isDone ? 'text-success' : 'text-muted-foreground/60'
      )}>
        {set.setNumber}
      </span>

      {/* Weight × Reps */}
      {rowFields.map((field, fi) => (
        <React.Fragment key={field}>
          {fi === 1 && rowFields.length === 2 && (
            <span className="text-muted-foreground/60 text-sm font-bold flex-shrink-0 select-none">×</span>
          )}
          <input
            type="number"
            inputMode={field === 'weight' || field === 'distance' ? 'decimal' : 'numeric'}
            placeholder={
              field === 'weight' && suggestedWeight ? `${suggestedWeight}`
                : field === 'reps' && repRange ? `${repRange[0]}`
                  : field === 'duration' ? 'sec'
                    : field === 'distance' ? 'ft'
                      : '–'
            }
            value={
              field === 'weight' ? (set.weight ?? '')
                : field === 'reps' ? (set.reps ?? '')
                  : field === 'duration' ? (set.duration ?? '')
                    : field === 'distance' ? (set.distance ?? '')
                      : ''
            }
            onChange={e => {
              const val = field === 'reps' ? parseInt(e.target.value) : parseFloat(e.target.value)
              updateSet(entryId, setIndex, { [field]: isNaN(val) ? null : val })
            }}
            className={cn(
              'w-16 h-9 rounded-lg text-center text-sm font-bold transition-colors',
              'bg-secondary/60 border border-border/50',
              'focus:border-primary/60 focus:ring-0 focus:outline-none',
              'placeholder:text-muted-foreground/40',
              isDone ? 'text-success' : 'text-foreground'
            )}
          />
        </React.Fragment>
      ))}

      {/* Done button */}
      <button
        onClick={() => updateSet(entryId, setIndex, { completed: !set.completed })}
        className={cn(
          'flex-shrink-0 flex items-center justify-center gap-1 px-2 h-9 rounded-lg transition-all duration-150 active:scale-95 font-bold text-xs',
          isDone
            ? 'bg-success text-white'
            : 'bg-primary text-white'
        )}
        aria-label="Mark set done"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Done
      </button>

      {/* Remove set */}
      {canRemove && (
        <button
          onClick={() => removeSet(entryId, setIndex)}
          className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center text-muted-foreground/30 hover:text-destructive transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
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
  distanceUnit,
}: {
  data: CardioWorkoutData
  setData: React.Dispatch<React.SetStateAction<CardioWorkoutData | null>>
  workoutName: string
  setWorkoutName: (name: string) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
  distanceUnit: 'miles' | 'km'
}) {
  const [durationMinutes, setDurationMinutes] = useState('')
  const [durationSeconds, setDurationSeconds] = useState('')
  const [showExitConfirm, setShowExitConfirm] = useState(false)

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

  useEffect(() => {
    const totalSeconds = (parseInt(durationMinutes) || 0) * 60 + (parseInt(durationSeconds) || 0)
    if (data.distance && totalSeconds > 0) {
      const pace = totalSeconds / data.distance
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
                <h3 className="text-base font-black text-foreground">Discard Activity?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">All progress will be lost.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 font-bold" onClick={() => setShowExitConfirm(false)}>
                Keep Going
              </Button>
              <Button variant="destructive" className="flex-1 font-bold" onClick={onCancel}>
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className="mb-6">
        <input
          className="w-full text-2xl font-black bg-transparent border-none focus:outline-none text-foreground placeholder:text-muted-foreground/40"
          placeholder="Name this session…"
          value={workoutName}
          onChange={e => setWorkoutName(e.target.value)}
        />
      </header>

      {/* Cardio Type */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Activity</p>
        <div className="grid grid-cols-5 gap-2">
          {cardioTypes.map(type => (
            <button
              key={type.value}
              onClick={() => updateData({ cardioType: type.value })}
              className={cn(
                'p-3 rounded-2xl flex flex-col items-center gap-1 transition-all duration-200',
                data.cardioType === type.value
                  ? 'bg-primary/15 border-2 border-primary shadow-glow-sm'
                  : 'bg-card border-2 border-transparent'
              )}
            >
              <span className="text-xl">{type.icon}</span>
              <span className="text-[10px] font-semibold">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">
              Distance ({distanceUnit})
            </label>
            <Input
              type="number"
              placeholder="0.00"
              value={data.distance || ''}
              onChange={e => updateData({ distance: parseFloat(e.target.value) || null })}
              className="text-2xl font-bold h-14 text-center"
              step="0.01"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">
              Duration
            </label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="00"
                value={durationMinutes}
                onChange={e => setDurationMinutes(e.target.value)}
                className="text-2xl font-bold h-14 text-center"
              />
              <span className="text-xl text-muted-foreground">:</span>
              <Input
                type="number"
                placeholder="00"
                value={durationSeconds}
                onChange={e => setDurationSeconds(e.target.value)}
                className="text-2xl font-bold h-14 text-center"
                max={59}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {data.distance && data.duration > 0 && (
        <Card className="mb-6 bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Avg Pace</p>
                <p className="text-3xl font-black text-primary font-mono">{formatPace(data.pace)}</p>
                <p className="text-xs text-muted-foreground">per {distanceUnit === 'miles' ? 'mile' : 'km'}</p>
              </div>
              <span className="text-4xl">⚡</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Calories</label>
                <Input type="number" placeholder="0" value={data.calories || ''} onChange={e => updateData({ calories: parseInt(e.target.value) || null })} className="h-12" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Elevation (ft)</label>
                <Input type="number" placeholder="0" value={data.elevationGain || ''} onChange={e => updateData({ elevationGain: parseInt(e.target.value) || null })} className="h-12" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Avg HR</label>
                <Input type="number" placeholder="0" value={data.avgHeartRate || ''} onChange={e => updateData({ avgHeartRate: parseInt(e.target.value) || null })} className="h-12" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Max HR</label>
                <Input type="number" placeholder="0" value={data.maxHeartRate || ''} onChange={e => updateData({ maxHeartRate: parseInt(e.target.value) || null })} className="h-12" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Notes</label>
            <textarea
              placeholder="How did it feel? Route details…"
              value={data.notes}
              onChange={e => updateData({ notes: e.target.value })}
              className="w-full h-24 bg-input/50 rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary border border-border/30"
            />
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent safe-area-bottom">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button variant="outline" className="flex-1" onClick={() => setShowExitConfirm(true)}>Discard</Button>
          <Button className="flex-1" onClick={onSave} disabled={isSaving} loading={isSaving}>
            Save Activity
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Celebration Screen
// ============================================================================

function QuickLogCelebration({
  data,
  onContinue,
}: {
  data: {
    workoutId: string
    workoutName: string
    totalSets: number
    totalExercises: number
    duration: number
    streak: number
    totalWorkouts: number
    newAchievements: AchievementId[]
    isCardio: boolean
    cardioStats?: { distance: number | null; duration: number; cardioType: string }
  }
  onContinue: () => void
}) {
  const [showAchievements, setShowAchievements] = useState(false)

  useEffect(() => {
    if (data.newAchievements.length > 0) {
      const timer = setTimeout(() => setShowAchievements(true), 800)
      return () => clearTimeout(timer)
    }
  }, [data.newAchievements])

  const streakMessage = getStreakMessage(data.streak)
  const isOnFire = data.streak >= 3

  const formatCardioDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getCardioEmoji = (type: string) => {
    const emojis: Record<string, string> = {
      running: '🏃', walking: '🚶', cycling: '🚴', swimming: '🏊',
      rowing: '🚣', hiking: '🥾', elliptical: '🔄', stair_climber: '🪜',
      jump_rope: '⏭️', other: '💪',
    }
    return emojis[type] || '💪'
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center safe-area-inset">
      {/* Hero */}
      <div className="mb-6 animate-float">
        <span className="text-7xl">
          {data.isCardio ? getCardioEmoji(data.cardioStats?.cardioType || 'other') : isOnFire ? '🔥' : '💪'}
        </span>
      </div>

      <h1 className="text-4xl font-black tracking-tight mb-1 animate-slide-up">
        {data.isCardio ? 'GREAT EFFORT!' : 'CRUSHED IT!'}
      </h1>
      <p className="text-muted-foreground mb-8 animate-slide-up">{data.workoutName} complete</p>

      {/* Stats card */}
      <div className={cn(
        'w-full max-w-sm mb-5 rounded-2xl border p-6 animate-slide-up',
        isOnFire
          ? 'border-primary/40 bg-gradient-to-br from-primary/10 to-transparent shadow-glow'
          : 'border-border/50 bg-card shadow-card'
      )}>
        {data.isCardio && data.cardioStats ? (
          <div className="space-y-3">
            {data.cardioStats.distance && (
              <div className="text-center">
                <div className="text-5xl font-black font-mono text-primary">{data.cardioStats.distance.toFixed(2)}</div>
                <p className="text-sm text-muted-foreground mt-1">miles</p>
              </div>
            )}
            <div className="flex justify-center gap-8">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono">{formatCardioDuration(data.cardioStats.duration)}</p>
                <p className="text-xs text-muted-foreground">duration</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center">
              <div className="text-5xl font-black font-mono text-primary">{data.totalSets}</div>
              <p className="text-sm text-muted-foreground mt-1">sets logged</p>
            </div>
            <div className="text-center">
              <div className="text-5xl font-black font-mono text-foreground">{data.totalExercises}</div>
              <p className="text-sm text-muted-foreground mt-1">exercises</p>
            </div>
          </div>
        )}
        {data.duration > 0 && !data.isCardio && (
          <div className="mt-4 pt-4 border-t border-border/30 text-center">
            <p className="text-sm text-muted-foreground">
              Time: <span className="font-bold text-foreground">{data.duration} min</span>
            </p>
          </div>
        )}
      </div>

      {/* Streak */}
      <div className={cn(
        'w-full max-w-sm mb-6 rounded-2xl border p-5 animate-slide-up',
        isOnFire ? 'border-primary/40 bg-primary/5 animate-glow' : 'border-border/50 bg-card'
      )}>
        <div className={cn('text-6xl font-black font-mono text-center', isOnFire ? 'text-primary' : 'text-foreground')}>
          {data.streak}
        </div>
        <p className="text-sm text-muted-foreground text-center mt-1">day streak</p>
        <p className="text-xs text-muted-foreground text-center mt-3">{streakMessage}</p>
      </div>

      {/* Achievements */}
      {data.newAchievements.length > 0 && showAchievements && (
        <div className="w-full max-w-sm mb-6 animate-bounce-in">
          <p className="text-xs font-bold text-primary uppercase tracking-widest mb-3">
            🏅 Achievement{data.newAchievements.length > 1 ? 's' : ''} Unlocked!
          </p>
          <div className="space-y-2">
            {data.newAchievements.map(achievementId => {
              const achievement = ACHIEVEMENTS[achievementId]
              if (!achievement) return null
              return (
                <div key={achievementId} className="rounded-2xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
                  <span className="text-3xl">{achievement.icon}</span>
                  <div className="text-left">
                    <p className="font-bold text-sm">{achievement.name}</p>
                    <p className="text-xs text-muted-foreground">{achievement.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground italic mb-8 max-w-xs">{getMotivationalQuote()}</p>

      <div className="w-full max-w-sm space-y-3">
        <Button
          size="lg"
          variant="outline"
          onClick={() => window.location.href = `/check-in?workoutId=${data.workoutId}&returnTo=/`}
          className="w-full"
        >
          ✨ Daily Check-In
        </Button>
        <Button size="lg" onClick={onContinue} className="w-full">
          Continue
        </Button>
      </div>
    </div>
  )
}

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

// ============================================================================
// Create Custom Exercise Form
// ============================================================================

function CreateCustomExerciseForm({
  onSave,
  onCancel,
}: {
  onSave: (exercise: Exercise) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [primaryMuscle, setPrimaryMuscle] = useState<string>('chest')
  const [equipment, setEquipment] = useState<string>('barbell')
  const [movementPattern, setMovementPattern] = useState<string>('horizontal_push')
  const [category, setCategory] = useState<string>('compound')

  const muscleOptions = [
    'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
    'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body',
  ]

  const equipmentOptions = [
    { value: 'barbell', label: 'Barbell' }, { value: 'dumbbell', label: 'Dumbbell' },
    { value: 'cable', label: 'Cable' }, { value: 'machine', label: 'Machine' },
    { value: 'bodyweight', label: 'Bodyweight' }, { value: 'kettlebell', label: 'Kettlebell' },
    { value: 'band', label: 'Band' }, { value: 'none', label: 'None' },
  ]

  const patternOptions = [
    { value: 'horizontal_push', label: 'Push (H)' }, { value: 'horizontal_pull', label: 'Pull (H)' },
    { value: 'vertical_push', label: 'Push (V)' }, { value: 'vertical_pull', label: 'Pull (V)' },
    { value: 'squat', label: 'Squat' }, { value: 'hinge', label: 'Hinge' },
    { value: 'lunge', label: 'Lunge' }, { value: 'carry', label: 'Carry' },
    { value: 'rotation', label: 'Rotation' }, { value: 'isolation', label: 'Isolation' },
    { value: 'conditioning', label: 'Conditioning' },
  ]

  const categoryOptions = [
    { value: 'compound', label: 'Compound' }, { value: 'accessory', label: 'Accessory' },
    { value: 'isolation', label: 'Isolation' }, { value: 'conditioning', label: 'Conditioning' },
    { value: 'core', label: 'Core' },
  ]

  const handleSave = () => {
    if (!name.trim()) return
    const exercise: Exercise = {
      id: `custom-${generateId()}`,
      name: name.trim(),
      category: category as Exercise['category'],
      primaryMuscles: [primaryMuscle as Exercise['primaryMuscles'][0]],
      secondaryMuscles: [],
      equipment: [equipment as Exercise['equipment'][0]],
      movementPattern: movementPattern as Exercise['movementPattern'],
      injuryContraindications: [],
      substitutes: [],
      cues: [],
      isCompound: category === 'compound',
      isUnilateral: false,
      isCustom: true,
    }
    onSave(exercise)
  }

  const pillClass = (active: boolean) =>
    cn(
      'px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 capitalize',
      active ? 'bg-primary text-white shadow-glow-sm' : 'bg-secondary text-muted-foreground'
    )

  return (
    <div className="min-h-screen bg-background p-4 safe-area-inset">
      <header className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-black text-foreground">Create Exercise</h2>
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="space-y-5">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-2">Exercise Name *</label>
          <Input placeholder="e.g., Cable Fly" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>

        {[
          { label: 'Primary Muscle', options: muscleOptions.map(m => ({ value: m, label: m.replace('_', ' ') })), value: primaryMuscle, setter: setPrimaryMuscle },
          { label: 'Equipment', options: equipmentOptions, value: equipment, setter: setEquipment },
          { label: 'Movement Pattern', options: patternOptions, value: movementPattern, setter: setMovementPattern },
          { label: 'Category', options: categoryOptions, value: category, setter: setCategory },
        ].map(({ label, options, value, setter }) => (
          <div key={label}>
            <label className="text-sm font-semibold text-foreground block mb-2">{label}</label>
            <div className="flex flex-wrap gap-2">
              {options.map(opt => (
                <button key={opt.value} onClick={() => setter(opt.value)} className={pillClass(value === opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <Button className="w-full" size="lg" onClick={handleSave} disabled={!name.trim()}>
          Create & Add Exercise
        </Button>
      </div>
    </div>
  )
}
