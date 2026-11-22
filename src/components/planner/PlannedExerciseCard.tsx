import { AnimatePresence, motion } from 'framer-motion'
import {
  cn,
  getExerciseInputKind,
  distanceUnitFor,
  secondsToMinutes,
  minutesToSeconds,
} from '@/lib/utils'
import type { Exercise, SetInstance } from '@/lib/types'
import { StepperCell } from './StepperCell'

interface PlannedExerciseCardProps {
  exercise: Exercise
  instanceId: string
  sets: SetInstance[]
  weightUnit: 'lbs' | 'kg'
  /** Open shows the editor; closed is a single summary row. */
  expanded: boolean
  onToggle: () => void
  onSetCountChange: (newCount: number) => void
  onSetPatch: (setId: string, patch: Partial<SetInstance>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** Link this exercise to its next neighbor as a superset. */
  onLinkNext?: () => void
  /** Remove this exercise from its current superset (only available when inSuperset). */
  onUnlink?: () => void
  /** Inside a superset the group draws the glass; the row itself stays flat. */
  inSuperset?: boolean
}

const ease = [0.32, 0.72, 0, 1] as const

export function PlannedExerciseCard({
  exercise,
  sets,
  weightUnit,
  expanded,
  onToggle,
  onSetCountChange,
  onSetPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
  onLinkNext,
  onUnlink,
  inSuperset,
}: PlannedExerciseCardProps) {
  const setCount = sets.length
  const isCardio = getExerciseInputKind(exercise) === 'cardio'
  const distanceUnit = distanceUnitFor(weightUnit)
  const unitShort = weightUnit === 'lbs' ? 'lb' : 'kg'

  // In planning mode all sets share one target. Changing it changes every set.
  const shared = <K extends keyof SetInstance>(k: K) =>
    sets.every(s => (s[k] ?? null) === (sets[0]?.[k] ?? null)) ? (sets[0]?.[k] ?? null) : null
  const reps = shared('targetReps') as number | null
  const weight = shared('targetWeight') as number | null
  const duration = shared('targetDuration') as number | null
  const distance = shared('targetDistance') as number | null

  const patchAll = (patch: Partial<SetInstance>) => sets.forEach(s => onSetPatch(s.id, patch))

  const minutes = secondsToMinutes(duration)
  const primary = isCardio
    ? minutes != null ? `${minutes} min` : `${setCount}×`
    : `${setCount} × ${reps ?? '–'}`
  const secondary = isCardio
    ? distance != null ? `${distance} ${distanceUnit}` : null
    : weight != null ? `${weight} ${unitShort}` : null

  const muscle = exercise.primaryMuscles[0]?.replace(/_/g, ' ')

  return (
    <motion.div
      layout="position"
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.24, ease }}
      className={cn(!inSuperset && 'glass rounded-3xl', 'overflow-hidden')}
    >
      {/* Summary row — the whole row toggles the editor. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.04] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-tight tracking-tight text-foreground truncate">{exercise.name}</p>
          {muscle && <p className="mt-0.5 text-xs capitalize text-muted-foreground truncate">{muscle}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[15px] font-semibold tabular-nums text-foreground">{primary}</p>
          {secondary && <p className="text-xs tabular-nums text-muted-foreground">{secondary}</p>}
        </div>
        <svg
          viewBox="0 0 24 24"
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300', expanded && 'rotate-180')}
          fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="editor"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              <div className="grid grid-cols-3 gap-2">
                {isCardio ? (
                  <>
                    <StepperCell label={setCount === 1 ? 'Session' : 'Sessions'} value={setCount} nullable={false}
                      onChange={(v) => v != null && onSetCountChange(Math.max(1, v))} min={1} max={20} />
                    <StepperCell label="Minutes" value={minutes} step={5} integer={false} max={600}
                      onChange={(v) => patchAll({ targetDuration: minutesToSeconds(v) })} />
                    <StepperCell label={distanceUnit} value={distance} step={0.5} integer={false} max={500}
                      onChange={(v) => patchAll({ targetDistance: v })} />
                  </>
                ) : (
                  <>
                    <StepperCell label="Sets" value={setCount} nullable={false}
                      onChange={(v) => v != null && onSetCountChange(Math.max(1, v))} min={1} max={20} />
                    <StepperCell label="Reps" value={reps} max={500}
                      onChange={(v) => patchAll({ targetReps: v })} />
                    <StepperCell label={unitShort} value={weight} step={5} integer={false} max={2000}
                      onChange={(v) => patchAll({ targetWeight: v })} />
                  </>
                )}
              </div>

              <div className="mt-2 flex items-center gap-1">
                {onMoveUp && <ActionButton label="Move up" onClick={onMoveUp}><path d="M18 15l-6-6-6 6" /></ActionButton>}
                {onMoveDown && <ActionButton label="Move down" onClick={onMoveDown}><path d="M6 9l6 6 6-6" /></ActionButton>}
                {onLinkNext && (
                  <ActionButton label={inSuperset ? 'Add next to superset' : 'Superset with next'} text={inSuperset ? 'Add next' : 'Superset'} onClick={onLinkNext}>
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </ActionButton>
                )}
                {onUnlink && (
                  <ActionButton label="Remove from superset" text="Unlink" onClick={onUnlink}>
                    <path d="M18.84 12.25l1.72-1.71a5 5 0 10-7.07-7.07l-1.72 1.71M5.16 11.75l-1.72 1.71a5 5 0 107.07 7.07l1.72-1.71" /><path d="M3 3l18 18" />
                  </ActionButton>
                )}
                <div className="flex-1" />
                <ActionButton label="Remove exercise" onClick={onRemove} danger>
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
                </ActionButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ActionButton({ label, text, onClick, danger, children }: {
  label: string
  text?: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'h-9 min-w-9 px-2.5 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors touch-manipulation',
        danger
          ? 'text-red-400/90 hover:bg-red-500/10 active:bg-red-500/15'
          : 'text-foreground/70 hover:text-foreground hover:bg-white/[0.07] active:bg-white/10'
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
      {text && <span>{text}</span>}
    </button>
  )
}
