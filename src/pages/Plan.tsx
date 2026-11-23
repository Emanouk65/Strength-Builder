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
  saveInstancesAsTemplate,
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
  // One exercise open at a time; the rest stay as one-line summaries.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const toggle = useCallback((id: string) => setExpandedId(cur => (cur === id ? null : id)), [])
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
    const id = await addExerciseToDraft(workoutId, ex.id, { sets: 3 })
    setExpandedId(id)
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

  const handleSaveGroupTemplate = useCallback(async (memberIds: string[]) => {
    const name = window.prompt('Name this superset template', 'Finisher superset')
    if (name == null) return
    await saveInstancesAsTemplate(memberIds, name)
    setTemplateFlash(true)
    setTimeout(() => setTemplateFlash(false), 2200)
  }, [])

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
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const isEmpty = instances.length === 0
  const isDraft = workout.status === 'draft'
  const totalSets = (sets ?? []).length
  const statusLabel =
    workout.status === 'planned' ? 'Scheduled' : workout.status === 'in_progress' ? 'In progress' : null

  const renderCard = (inst: ExerciseInstance, inSuperset: boolean, groupSize = 0) => {
    const ex = exerciseMap.get(inst.exerciseId)
    if (!ex) return null
    const idx = instances.findIndex(i => i.id === inst.id)
    const hasNext = idx >= 0 && idx < instances.length - 1
    return (
      <PlannedExerciseCard
        key={inst.id}
        exercise={ex}
        instanceId={inst.id}
        sets={setsByInstance.get(inst.id) ?? []}
        weightUnit={user.preferences.weightUnit}
        expanded={expandedId === inst.id}
        onToggle={() => toggle(inst.id)}
        onSetCountChange={(c) => handleSetCountChange(inst.id, c)}
        onSetPatch={handleSetPatch}
        onRemove={() => handleRemoveExercise(inst.id)}
        onMoveUp={idx > 0 ? () => handleMove(inst.id, -1) : undefined}
        onMoveDown={hasNext ? () => handleMove(inst.id, 1) : undefined}
        onLinkNext={hasNext && (!inSuperset || groupSize < SUPERSET_MAX_MEMBERS) ? () => handleLinkNext(inst.id) : undefined}
        onUnlink={inSuperset ? () => handleUnlink(inst.id) : undefined}
        inSuperset={inSuperset}
      />
    )
  }

  return (
    <div className="min-h-screen pb-36">
      {/* Header */}
      <header className="sticky top-0 z-40 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
        <div className="max-w-lg mx-auto glass-bar rounded-full pl-1.5 pr-1.5 py-1.5 flex items-center gap-1">
          <IconButton label="Back" onClick={() => navigate('/')}>
            <path d="M15 18l-6-6 6-6" />
          </IconButton>
          <div className="flex-1 min-w-0 px-1">
            <input
              type="text"
              value={localName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Untitled workout"
              aria-label="Workout name"
              className="w-full bg-transparent text-[17px] font-semibold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <p className="text-[11px] text-muted-foreground tabular-nums leading-tight">
              {statusLabel && <span className="text-foreground/80">{statusLabel} · </span>}
              {instances.length} {instances.length === 1 ? 'exercise' : 'exercises'} · {totalSets} sets
            </p>
          </div>
          <IconButton label="Templates" onClick={() => setTemplatesOpen(true)}>
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
          </IconButton>
          {isDraft && (
            <IconButton label="Discard draft" onClick={() => setDiscardConfirm(true)} danger>
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
            </IconButton>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="max-w-lg mx-auto px-3 pt-2">
        {isEmpty ? (
          <motion.div
            initial={{ y: 12 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.3 }}
            className="glass rounded-4xl mt-6 px-6 py-10 flex flex-col items-center text-center"
          >
            <div className="h-14 w-14 rounded-full glass-soft flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-foreground/80" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">New workout</h2>
            <Button onClick={() => setPickerOpen(true)} className="mt-6 w-full">
              Add exercises
            </Button>
            {templates && templates.length > 0 && (
              <Button variant="secondary" onClick={() => setTemplatesOpen(true)} className="mt-2 w-full">
                Use a template
              </Button>
            )}
          </motion.div>
        ) : (
          <motion.div className="flex flex-col gap-2.5" {...listMotion}>
            <AnimatePresence initial={false}>
              {groupedRendering(instances).map(group => {
                if (group.kind === 'solo') return renderCard(group.instance, false)
                return (
                  <motion.div
                    key={group.groupId}
                    layout="position"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.22 }}
                    className="glass rounded-3xl overflow-hidden"
                  >
                    <div className="flex items-center gap-2 pl-4 pr-2 pt-2.5">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-foreground/60" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                      <span className="eyebrow flex-1">Superset</span>
                      <button
                        onClick={() => handleSaveGroupTemplate(group.members.map(m => m.id))}
                        className="h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.07] transition-colors"
                        aria-label="Save this superset as a template"
                      >
                        Save
                      </button>
                    </div>
                    {/* Members hang off one rail, so the pairing reads at a glance. */}
                    <div className="relative">
                      <span className="absolute left-[18px] top-4 bottom-4 w-[2px] rounded-full bg-gradient-to-b from-white/35 via-white/15 to-white/35" aria-hidden />
                      <div className="pl-3 divide-y divide-white/[0.06]">
                        {group.members.map(inst => renderCard(inst, true, group.members.length))}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* Floating action bar: add, schedule, start — always in thumb reach. */}
      {!isEmpty && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <div className="max-w-lg mx-auto glass-bar rounded-full p-1.5 flex items-center gap-1.5">
            <button
              onClick={() => setPickerOpen(true)}
              className="h-12 pl-4 pr-5 flex items-center gap-2 rounded-full glass-soft text-sm font-semibold text-foreground active:scale-[0.97] transition-transform"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Add
            </button>
            {workout.status === 'in_progress' ? (
              <Button onClick={() => navigate(`/workout/${workout.id}`)} className="flex-1 h-12">
                Back to workout
              </Button>
            ) : (
              <>
                <button
                  onClick={() => setScheduleOpen(true)}
                  aria-label="Schedule for later"
                  className="h-12 w-12 shrink-0 flex items-center justify-center rounded-full glass-soft text-foreground active:scale-[0.95] transition-transform"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                </button>
                <Button onClick={handleStartNow} className="flex-1 h-12">
                  Start
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
      <Sheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} title="Templates">
        {!isEmpty && (
          <Button variant="secondary" onClick={handleSaveTemplate} className="w-full mb-3">
            {templateFlash ? 'Saved' : 'Save this workout as a template'}
          </Button>
        )}
        {!templates || templates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No templates yet</p>
        ) : (
          <div className="space-y-2 pb-2">
            {templates.map((t: WorkoutTemplate) => (
              <div key={t.id} className="flex items-center gap-2 rounded-2xl glass-soft p-3">
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
              className="fixed inset-0 z-[80] bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDiscardConfirm(false)}
            />
            <motion.div
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[90] max-w-sm mx-auto rounded-3xl glass-bar p-5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
            >
              <h3 className="text-base font-semibold text-foreground">Discard this draft?</h3>
              <p className="text-sm text-muted-foreground mt-1">This can't be undone.</p>
              <div className="mt-4 flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setDiscardConfirm(false)}>
                  Cancel
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

function IconButton({ label, onClick, danger, children }: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={
        'h-10 w-10 shrink-0 flex items-center justify-center rounded-full transition-colors ' +
        (danger
          ? 'text-muted-foreground hover:text-red-400 hover:bg-red-500/10'
          : 'text-foreground/80 hover:text-foreground hover:bg-white/[0.08] active:bg-white/[0.12]')
      }
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  )
}
