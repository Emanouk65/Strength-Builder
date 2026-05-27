import { motion } from 'framer-motion'
import { NumberStepper } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Exercise, SetInstance } from '@/lib/types'

interface PlannedExerciseCardProps {
  exercise: Exercise
  instanceId: string
  sets: SetInstance[]
  weightUnit: 'lbs' | 'kg'
  onSetCountChange: (newCount: number) => void
  onSetPatch: (setId: string, patch: Partial<SetInstance>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** Link this exercise to its next neighbor as a superset. */
  onLinkNext?: () => void
  /** Remove this exercise from its current superset (only available when inSuperset). */
  onUnlink?: () => void
  /** When true the card renders flat-on-flat (no outer border) for use inside a superset container. */
  inSuperset?: boolean
}

export function PlannedExerciseCard({
  exercise,
  sets,
  weightUnit,
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
  // In planning mode all sets share the same target. Changing one changes all.
  const sharedReps = sets.every(s => s.targetReps === sets[0]?.targetReps) ? sets[0]?.targetReps ?? null : null
  const sharedWeight = sets.every(s => s.targetWeight === sets[0]?.targetWeight) ? sets[0]?.targetWeight ?? null : null

  const patchAll = (patch: Partial<SetInstance>) => {
    sets.forEach(s => onSetPatch(s.id, patch))
  }

  // Summary line: "3 × 8 @ 135 lbs" — at-a-glance readability.
  const summary = (() => {
    const parts: string[] = []
    parts.push(`${setCount} ${setCount === 1 ? 'set' : 'sets'}`)
    if (sharedReps != null) parts.push(`${sharedReps} reps`)
    if (sharedWeight != null) parts.push(`${sharedWeight} ${weightUnit}`)
    return parts.join(' · ')
  })()

  const muscles = exercise.primaryMuscles.slice(0, 3).map(m =>
    m.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  ).join(' · ')

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'rounded-2xl overflow-hidden',
        inSuperset
          ? 'bg-card/80 border border-border/40'
          : 'bg-card border border-border/50 shadow-card'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-foreground leading-tight truncate">
            {exercise.name}
          </h3>
          {muscles && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{muscles}</p>
          )}
          <p className="text-xs text-muted-foreground/80 mt-1 font-mono">{summary}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 -mr-2">
          {onMoveUp && (
            <button
              onClick={onMoveUp}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors touch-target"
              aria-label="Move up"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={onMoveDown}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors touch-target"
              aria-label="Move down"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          )}
          {onLinkNext && !inSuperset && (
            <button
              onClick={onLinkNext}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors touch-target"
              aria-label="Superset with next"
              title="Group with next exercise as a superset"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
            </button>
          )}
          {onLinkNext && inSuperset && (
            <button
              onClick={onLinkNext}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors touch-target"
              aria-label="Add next exercise to superset"
              title="Add the next exercise to this superset"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          )}
          {onUnlink && (
            <button
              onClick={onUnlink}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors touch-target"
              aria-label="Remove from superset"
              title="Break out of the superset"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18.84 12.25l1.72-1.71a5 5 0 10-7.07-7.07l-1.72 1.71M14 11l-7.07 7.07a5 5 0 11-7.07-7.07L7 4" /><path d="M3 3l18 18" /></svg>
            </button>
          )}
          <button
            onClick={onRemove}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors touch-target"
            aria-label="Remove exercise"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" /></svg>
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/40 mx-5" />

      {/* Controls */}
      <div className="px-5 py-4 flex flex-col gap-3">
        <ControlRow label="Sets">
          <NumberStepper
            value={setCount}
            onChange={(v) => v != null && onSetCountChange(Math.max(1, v))}
            min={1}
            max={20}
            ariaLabel="set count"
            size="md"
            pill
          />
        </ControlRow>

        <ControlRow label="Reps per set">
          <NumberStepper
            value={sharedReps}
            onChange={(v) => patchAll({ targetReps: v })}
            min={0}
            max={500}
            allowNull
            ariaLabel="target reps"
            size="md"
            pill
          />
        </ControlRow>

        <ControlRow label={`Weight (${weightUnit})`}>
          <NumberStepper
            value={sharedWeight}
            onChange={(v) => patchAll({ targetWeight: v })}
            min={0}
            max={2000}
            step={5}
            allowNull
            ariaLabel="target weight"
            integer={false}
            size="md"
            pill
          />
        </ControlRow>
      </div>
    </motion.div>
  )
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-foreground/80">{label}</span>
      {children}
    </div>
  )
}
