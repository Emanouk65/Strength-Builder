import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import {
  db,
  getCurrentUser,
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
  addExerciseToSuperset,
  removeExerciseFromSuperset,
  resolveExercises,
  saveWorkoutAsTemplate,
  getWorkoutTemplates,
  applyTemplateToDraft,
  deleteWorkoutTemplate,
  SUPERSET_MAX_MEMBERS,
} from '@/db'
import { Button, Sheet } from '@/components/ui'
import type { WorkoutTemplate } from '@/lib/types'
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

  // workoutId is derived directly from the URL — no mirroring state, no race.
  const workoutId = urlWorkoutId ?? null

  const [pickerOpen, setPickerOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [discardConfirm, setDiscardConfirm] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateFlash, setTemplateFlash] = useState(false)
  const initRef = useRef(false)

  const templates = useLiveQuery(() => getWorkoutTemplates(), [])

  // Defensive: ensure body scroll is unlocked whenever the planner mounts.
  // If a Sheet (picker/schedule) was open when the user navigated away, an
  // edge-case unmount order could leave `document.body.style.overflow = 'hidden'`
  // behind, and on re-entry the page renders with a frozen scroll surface and
  // the leftover backdrop-blur attribution from the sheet's overlay can make
  // the content read as "really dark". Clearing here makes re-entry seamless.
  useEffect(() => {
    document.body.style.overflow = ''
  }, [])

  // Bootstrap: when URL has no workoutId, find or create a draft and
  // redirect to the canonical /plan/:id URL. createDraftWorkout is atomic
  // (transactional) — returns the existing draft if one exists, never creates
  // a duplicate.
  useEffect(() => {
    if (!user) return
    if (urlWorkoutId) return
    if (initRef.current) return
    initRef.current = true

    let cancelled = false
    ;(async () => {
      const target = await createDraftWorkout(user.id)
      if (cancelled) return
      navigate(`/plan/${target.id}`, { replace: true })
    })()

    return () => { cancelled = true }
  }, [user, urlWorkoutId, navigate])

  const workout = useLiveQuery(
    () => (workoutId ? db.workouts.get(workoutId) : undefined),
    [workoutId]
  )

  // Guard the URL: if it points at a workout that doesn't exist (deleted draft,
  // stale link) fall back to a fresh draft; if it points at a completed workout,
  // route to the read-only execution/summary view. Mid-workout editing is
  // allowed (status === 'in_progress') so users can adjust exercises on the fly.
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
      if (w.status === 'completed') {
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

  // resolveExercises falls back to the in-memory EXERCISE_LIBRARY whenever an
  // id is missing from the Dexie `exercises` table — covers returning users
  // who picked an exercise that wasn't yet seeded in their local copy.
  // Without this, picking such an exercise would silently drop the card
  // (the planner `if (!ex) return null` branch) even though the underlying
  // ExerciseInstance was correctly saved.
  const exercises = useLiveQuery<Exercise[]>(
    async () => {
      if (exerciseIds.length === 0) return []
      const map = await resolveExercises(exerciseIds)
      return Array.from(map.values())
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

  // Track instance count growth so we can scroll the new card into view after
  // a user-initiated add. Once the list overflows the viewport, the new card
  // gets inserted below the fold and the user assumes the add silently failed.
  const prevInstancesCountRef = useRef(0)
  const justAddedRef = useRef(false)
  useEffect(() => {
    const count = instances?.length ?? 0
    if (justAddedRef.current && count > prevInstancesCountRef.current) {
      justAddedRef.current = false
      // Two RAFs: let React commit + framer-motion start the enter animation
      // before measuring scrollHeight.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth',
          })
        })
      })
    }
    prevInstancesCountRef.current = count
  }, [instances])

  // Handlers
  const handleAddExercise = useCallback(async (ex: Exercise) => {
    if (!workoutId) return
    justAddedRef.current = true
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

  /**
   * Link an exercise with its next neighbor into a superset. If the neighbor is
   * already in a group, join it. Otherwise create a new group.
   */
  const handleLinkNext = useCallback(async (instanceId: string) => {
    if (!instances) return
    const idx = instances.findIndex(i => i.id === instanceId)
    if (idx < 0 || idx === instances.length - 1) return
    const me = instances[idx]
    const next = instances[idx + 1]
    // Resolve target group: prefer existing group on this exercise, then next's, then a new one.
    let group = me.supersetGroupId ?? next.supersetGroupId ?? null
    group = await addExerciseToSuperset(me.id, group)
    if (group) await addExerciseToSuperset(next.id, group)
  }, [instances])

  const handleUnlink = useCallback(async (instanceId: string) => {
    await removeExerciseFromSuperset(instanceId)
  }, [])

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

  const handleSaveTemplate = useCallback(async () => {
    if (!workoutId) return
    const name = window.prompt('Name this template', localName.trim() || 'My template')
    if (name == null) return // cancelled
    await saveWorkoutAsTemplate(workoutId, name)
    setTemplateFlash(true)
    setTimeout(() => setTemplateFlash(false), 2200)
  }, [workoutId, localName])

  const handleUseTemplate = useCallback(async (templateId: string) => {
    if (!workoutId) return
    justAddedRef.current = true
    await applyTemplateToDraft(workoutId, templateId)
    setTemplatesOpen(false)
  }, [workoutId])

  // Wait for the full chain to resolve before deciding empty vs populated.
  // Otherwise the page briefly flashes "Build your workout" on a draft that
  // already has exercises, because instances is undefined while loading.
  const dataLoading =
    !user ||
    !workoutId ||
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
              {isDraft ? 'Drafting' : workout.status === 'planned' ? 'Scheduled' : workout.status === 'in_progress' ? 'Editing — workout in progress' : 'Editing'}
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
            // Slide-only entrance — never fade through opacity so the empty
            // state stays readable even if the parent transition is mid-fade.
            initial={{ y: 12 }}
            animate={{ y: 0 }}
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
            {templates && templates.length > 0 && (
              <button
                onClick={() => setTemplatesOpen(true)}
                className="mt-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                or start from a template
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div className="flex flex-col gap-3" {...listMotion}>
            <AnimatePresence initial={false}>
              {groupedRendering(instances).map(group => {
                if (group.kind === 'solo') {
                  const inst = group.instance
                  const ex = exerciseMap.get(inst.exerciseId)
                  if (!ex) return null
                  const idx = instances.findIndex(i => i.id === inst.id)
                  const canLinkNext = idx >= 0 && idx < instances.length - 1
                  return (
                    <PlannedExerciseCard
                      key={inst.id}
                      exercise={ex}
                      instanceId={inst.id}
                      sets={setsByInstance.get(inst.id) ?? []}
                      weightUnit={user.preferences.weightUnit}
                      onSetCountChange={(c) => handleSetCountChange(inst.id, c)}
                      onSetPatch={handleSetPatch}
                      onRemove={() => handleRemoveExercise(inst.id)}
                      onMoveUp={idx > 0 ? () => handleMove(inst.id, -1) : undefined}
                      onMoveDown={canLinkNext ? () => handleMove(inst.id, 1) : undefined}
                      onLinkNext={canLinkNext ? () => handleLinkNext(inst.id) : undefined}
                    />
                  )
                }
                // Superset group
                return (
                  <motion.div
                    key={group.groupId}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.22 }}
                    className="relative rounded-2xl bg-foreground/[0.03] border border-foreground/15 p-2.5 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between px-2 pt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground/70">
                        Superset · {group.members.length} exercises
                      </span>
                      {group.members.length < SUPERSET_MAX_MEMBERS && (
                        <span className="text-[10px] text-muted-foreground">
                          Up to {SUPERSET_MAX_MEMBERS - group.members.length} more
                        </span>
                      )}
                    </div>
                    {group.members.map((inst) => {
                      const ex = exerciseMap.get(inst.exerciseId)
                      if (!ex) return null
                      const idx = instances.findIndex(i => i.id === inst.id)
                      const canLinkNext =
                        idx >= 0 &&
                        idx < instances.length - 1 &&
                        group.members.length < SUPERSET_MAX_MEMBERS
                      return (
                        <PlannedExerciseCard
                          key={inst.id}
                          exercise={ex}
                          instanceId={inst.id}
                          sets={setsByInstance.get(inst.id) ?? []}
                          weightUnit={user.preferences.weightUnit}
                          onSetCountChange={(c) => handleSetCountChange(inst.id, c)}
                          onSetPatch={handleSetPatch}
                          onRemove={() => handleRemoveExercise(inst.id)}
                          onMoveUp={idx > 0 ? () => handleMove(inst.id, -1) : undefined}
                          onMoveDown={idx < instances.length - 1 ? () => handleMove(inst.id, 1) : undefined}
                          onUnlink={() => handleUnlink(inst.id)}
                          onLinkNext={canLinkNext ? () => handleLinkNext(inst.id) : undefined}
                          inSuperset
                        />
                      )
                    })}
                  </motion.div>
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

            <div className="flex items-center justify-center gap-4 pt-1">
              {templates && templates.length > 0 && (
                <button
                  onClick={() => setTemplatesOpen(true)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Add from template
                </button>
              )}
              <button
                onClick={handleSaveTemplate}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {templateFlash ? '✓ Saved as template' : 'Save as template'}
              </button>
            </div>
          </motion.div>
        )}
      </main>

      {/* Bottom action bar — adapts to workout status */}
      {!isEmpty && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-background/85 backdrop-blur-xl border-t border-border/40 safe-area-bottom">
          <div className="max-w-lg mx-auto px-4 py-3 flex gap-2">
            {workout.status === 'in_progress' ? (
              <Button onClick={() => navigate(`/workout/${workout.id}`)} className="w-full">
                Back to workout
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </Button>
            ) : (
              <>
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
              </>
            )}
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

      {/* Template picker */}
      <Sheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} title="Start from a template">
        {!templates || templates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No templates yet. Build a workout and tap "Save as template" to reuse it later.
          </p>
        ) : (
          <div className="space-y-2 pb-2">
            {templates.map((t: WorkoutTemplate) => (
              <div key={t.id} className="flex items-center gap-2 rounded-2xl bg-card border border-border/50 p-3">
                <button
                  onClick={() => handleUseTemplate(t.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="font-semibold text-foreground truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}
                  </p>
                </button>
                <button
                  onClick={() => deleteWorkoutTemplate(t.id)}
                  className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={`Delete template ${t.name}`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Sheet>

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

// Group consecutive exercises sharing the same supersetGroupId into a single
// render group so we can wrap them in a superset container.
type RenderItem =
  | { kind: 'solo'; instance: ExerciseInstance }
  | { kind: 'group'; groupId: string; members: ExerciseInstance[] }

function groupedRendering(instances: ExerciseInstance[]): RenderItem[] {
  const out: RenderItem[] = []
  let i = 0
  while (i < instances.length) {
    const inst = instances[i]
    if (!inst.supersetGroupId) {
      out.push({ kind: 'solo', instance: inst })
      i++
      continue
    }
    // Collect consecutive instances with the same group id.
    const groupId = inst.supersetGroupId
    const members: ExerciseInstance[] = []
    while (i < instances.length && instances[i].supersetGroupId === groupId) {
      members.push(instances[i])
      i++
    }
    if (members.length === 1) {
      // Orphan group — treat as solo to avoid wrapping a single card.
      out.push({ kind: 'solo', instance: members[0] })
    } else {
      out.push({ kind: 'group', groupId, members })
    }
  }
  return out
}
