import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import {
  db,
  getCurrentUser,
  getDraftWorkout,
  createDraftWorkout,
  addExerciseToDraft,
  removeExerciseFromDraft,
  updateSetInstance,
  setExerciseSetCount,
  reorderExercises,
  patchWorkout,
  scheduleDraft,
  promoteToInProgress,
  discardDraft,
} from '@/db'
import { Button } from '@/components/ui'
import { ExercisePicker } from '@/components/planner/ExercisePicker'
import { PlannedExerciseCard } from '@/components/planner/PlannedExerciseCard'
import { ScheduleSheet } from '@/components/planner/ScheduleSheet'
import { listMotion } from '@/lib/utils'
import type { Exercise, SetInstance, WorkoutBlock, ExerciseInstance } from '@/lib/types'

/**
 * Single, unified planning surface.
 * - `/plan` with no id → finds/creates a draft for the user, redirects to `/plan/:id`
 * - `/plan/:id` → live-edits an existing draft or planned workout
 *
 * Every interaction writes to Dexie immediately. There is no in-memory-only state.
 */
export function Plan() {
  const { workoutId: urlWorkoutId } = useParams<{ workoutId: string }>()
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser(), [])

  const [workoutId, setWorkoutId] = useState<string | null>(urlWorkoutId ?? null)
  const [bootstrapping, setBootstrapping] = useState(!urlWorkoutId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [discardConfirm, setDiscardConfirm] = useState(false)
  const initRef = useRef(false)

  // Bootstrap: if no workoutId in URL, find or create a draft.
  useEffect(() => {
    if (!user) return
    if (urlWorkoutId) {
      setWorkoutId(urlWorkoutId)
      setBootstrapping(false)
      return
    }
    if (initRef.current) return
    initRef.current = true

    let cancelled = false
    ;(async () => {
      const existing = await getDraftWorkout(user.id)
      const target = existing ?? await createDraftWorkout(user.id)
      if (cancelled) return
      setWorkoutId(target.id)
      setBootstrapping(false)
      navigate(`/plan/${target.id}`, { replace: true })
    })()

    return () => { cancelled = true }
  }, [user, urlWorkoutId, navigate])

  const workout = useLiveQuery(
    () => (workoutId ? db.workouts.get(workoutId) : undefined),
    [workoutId]
  )

  // Guard the URL: if it points at a workout that doesn't exist (deleted draft,
  // stale link) fall back to a fresh draft; if it points at a completed or
  // in-progress workout, route to the execution view where it belongs.
  useEffect(() => {
    if (!workoutId) return
    let cancelled = false
    ;(async () => {
      const w = await db.workouts.get(workoutId)
      if (cancelled) return
      if (!w) {
        navigate('/plan', { replace: true })
        return
      }
      if (w.status === 'in_progress' || w.status === 'completed') {
        navigate(`/workout/${w.id}`, { replace: true })
      }
    })()
    return () => { cancelled = true }
  }, [workoutId, navigate])

  const blocks = useLiveQuery<WorkoutBlock[]>(
    async () => {
      if (!workoutId) return []
      return db.workoutBlocks.where('workoutId').equals(workoutId).sortBy('order')
    },
    [workoutId]
  )

  const blockIds = useMemo(() => blocks?.map(b => b.id) ?? [], [blocks])

  const instances = useLiveQuery<ExerciseInstance[]>(
    async () => {
      if (blockIds.length === 0) return []
      const list = await db.exerciseInstances.where('blockId').anyOf(blockIds).toArray()
      return list.sort((a, b) => a.order - b.order)
    },
    [blockIds.join('|')]
  )

  const instanceIds = useMemo(() => instances?.map(i => i.id) ?? [], [instances])

  const sets = useLiveQuery<SetInstance[]>(
    async () => {
      if (instanceIds.length === 0) return []
      return db.setInstances.where('exerciseInstanceId').anyOf(instanceIds).toArray()
    },
    [instanceIds.join('|')]
  )

  const exerciseIds = useMemo(() => [...new Set((instances ?? []).map(i => i.exerciseId))], [instances])

  const exercises = useLiveQuery<Exercise[]>(
    async () => {
      if (exerciseIds.length === 0) return []
      const lib = await db.exercises.where('id').anyOf(exerciseIds).toArray()
      const custom = await db.customExercises.where('id').anyOf(exerciseIds).toArray()
      return [...lib, ...custom]
    },
    [exerciseIds.join('|')]
  )

  const exerciseMap = useMemo(() => {
    const m = new Map<string, Exercise>()
    ;(exercises ?? []).forEach(e => m.set(e.id, e))
    return m
  }, [exercises])

  const setsByInstance = useMemo(() => {
    const m = new Map<string, SetInstance[]>()
    ;(sets ?? []).forEach(s => {
      const list = m.get(s.exerciseInstanceId) ?? []
      list.push(s)
      m.set(s.exerciseInstanceId, list)
    })
    m.forEach(list => list.sort((a, b) => a.setNumber - b.setNumber))
    return m
  }, [sets])

  // Debounced name save.
  const [localName, setLocalName] = useState('')
  const nameLoadedRef = useRef(false)
  useEffect(() => {
    if (workout?.name !== undefined && !nameLoadedRef.current) {
      setLocalName(workout.name)
      nameLoadedRef.current = true
    }
  }, [workout?.name])

  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onNameChange = (val: string) => {
    setLocalName(val)
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current)
    nameTimerRef.current = setTimeout(() => {
      if (workoutId) patchWorkout(workoutId, { name: val.trim() })
    }, 400)
  }

  // Handlers
  const handleAddExercise = useCallback(async (ex: Exercise) => {
    if (!workoutId) return
    await addExerciseToDraft(workoutId, ex.id, { sets: 3 })
  }, [workoutId])

  const handleSetCountChange = useCallback(async (instanceId: string, newCount: number) => {
    await setExerciseSetCount(instanceId, newCount)
  }, [])

  const handleSetPatch = useCallback(async (setId: string, patch: Partial<SetInstance>) => {
    await updateSetInstance(setId, patch)
  }, [])

  const handleRemoveExercise = useCallback(async (instanceId: string) => {
    await removeExerciseFromDraft(instanceId)
  }, [])

  const handleMove = useCallback(async (instanceId: string, direction: -1 | 1) => {
    if (!instances || !blocks?.[0]) return
    const idx = instances.findIndex(i => i.id === instanceId)
    if (idx < 0) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= instances.length) return
    const ordered = [...instances]
    const [item] = ordered.splice(idx, 1)
    ordered.splice(newIdx, 0, item)
    await reorderExercises(blocks[0].id, ordered.map(i => i.id))
  }, [instances, blocks])

  const handleStartNow = useCallback(async () => {
    if (!workoutId) return
    if (nameTimerRef.current) {
      clearTimeout(nameTimerRef.current)
      await patchWorkout(workoutId, { name: localName.trim() })
    }
    await promoteToInProgress(workoutId)
    navigate(`/workout/${workoutId}`)
  }, [workoutId, localName, navigate])

  const handleSchedule = useCallback(async (date: Date) => {
    if (!workoutId) return
    if (nameTimerRef.current) {
      clearTimeout(nameTimerRef.current)
      await patchWorkout(workoutId, { name: localName.trim() })
    }
    await scheduleDraft(workoutId, date, localName.trim() || `Workout for ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
    setScheduleOpen(false)
    navigate('/')
  }, [workoutId, localName, navigate])

  const handleDiscard = useCallback(async () => {
    if (!workoutId) return
    await discardDraft(workoutId)
    navigate('/')
  }, [workoutId, navigate])

  // Wait for the full chain to resolve before deciding empty vs populated.
  // Otherwise the page briefly flashes "Build your workout" on a draft that
  // already has exercises, because instances is undefined while loading.
  const dataLoading =
    bootstrapping ||
    !user ||
    !workout ||
    blocks === undefined ||
    instances === undefined ||
    sets === undefined ||
    (exerciseIds.length > 0 && exercises === undefined)

  if (dataLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const isEmpty = instances.length === 0
  const isDraft = workout.status === 'draft'

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border/40 safe-area-bottom">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label="Back"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {isDraft ? 'Drafting' : workout.status === 'planned' ? 'Scheduled' : 'Editing'}
            </div>
            <input
              type="text"
              value={localName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Untitled workout"
              className="w-full bg-transparent text-lg font-semibold text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>
          {isDraft && (
            <button
              onClick={() => setDiscardConfirm(true)}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Discard draft"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" /></svg>
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="max-w-lg mx-auto px-4 py-5">
        {isEmpty ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="h-16 w-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground">Build your workout</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Add exercises one at a time. Everything autosaves — close the app and pick up later.
            </p>
            <Button onClick={() => setPickerOpen(true)} className="mt-6">
              Add first exercise
            </Button>
          </motion.div>
        ) : (
          <motion.div className="flex flex-col gap-3" {...listMotion}>
            <AnimatePresence initial={false}>
              {(instances ?? []).map((inst, idx) => {
                const ex = exerciseMap.get(inst.exerciseId)
                if (!ex) return null
                const setList = setsByInstance.get(inst.id) ?? []
                return (
                  <PlannedExerciseCard
                    key={inst.id}
                    exercise={ex}
                    instanceId={inst.id}
                    sets={setList}
                    weightUnit={user.preferences.weightUnit}
                    onSetCountChange={(c) => handleSetCountChange(inst.id, c)}
                    onSetPatch={handleSetPatch}
                    onRemove={() => handleRemoveExercise(inst.id)}
                    onMoveUp={idx > 0 ? () => handleMove(inst.id, -1) : undefined}
                    onMoveDown={idx < (instances?.length ?? 0) - 1 ? () => handleMove(inst.id, 1) : undefined}
                  />
                )
              })}
            </AnimatePresence>

            <button
              onClick={() => setPickerOpen(true)}
              className="h-12 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-secondary/30 transition-colors active:scale-[0.985]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Add another exercise
            </button>
          </motion.div>
        )}
      </main>

      {/* Bottom action bar */}
      {!isEmpty && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-background/85 backdrop-blur-xl border-t border-border/40 safe-area-bottom">
          <div className="max-w-lg mx-auto px-4 py-3 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setScheduleOpen(true)}
              className="flex-1"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              Save for later
            </Button>
            <Button onClick={handleStartNow} className="flex-1">
              Start now
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Button>
          </div>
        </div>
      )}

      {/* Sheets */}
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handleAddExercise}
        alreadyAddedIds={exerciseIds}
      />
      <ScheduleSheet
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSchedule={handleSchedule}
      />

      {/* Discard confirm */}
      <AnimatePresence>
        {discardConfirm && (
          <>
            <motion.div
              className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDiscardConfirm(false)}
            />
            <motion.div
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[90] max-w-sm mx-auto rounded-2xl bg-card border border-border/60 p-5 shadow-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
            >
              <h3 className="text-base font-semibold text-foreground">Discard this draft?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your planned exercises will be deleted. This can't be undone.
              </p>
              <div className="mt-4 flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setDiscardConfirm(false)}>
                  Keep editing
                </Button>
                <Button variant="destructive" onClick={handleDiscard}>
                  Discard
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
