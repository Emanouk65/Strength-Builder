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
}: PlannedExerciseCardProps) {
  const setCount = sets.length
  // For the planning view, target reps & target weight typically agree across
  // all sets in the same exercise. We show one "target" pair, and changing it
  // patches every set. Per-set tweaks are handled in execution view.
  const sharedReps = sets.every(s => s.targetReps === sets[0]?.targetReps) ? sets[0]?.targetReps ?? null : null
  const sharedWeight = sets.every(s => s.targetWeight === sets[0]?.targetWeight) ? sets[0]?.targetWeight ?? null : null

  const patchAll = (patch: Partial<SetInstance>) => {
    sets.forEach(s => onSetPatch(s.id, patch))
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="rounded-2xl bg-card border border-border/40 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border/30">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground truncate">{exercise.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {exercise.primaryMuscles.slice(0, 2).join(', ')}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onMoveUp && (
            <button onClick={onMoveUp} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors" aria-label="Move up">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
            </button>
          )}
          {onMoveDown && (
            <button onClick={onMoveDown} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors" aria-label="Move down">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          )}
          <button onClick={onRemove} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" aria-label="Remove exercise">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" /></svg>
          </button>
        </div>
      </div>

      {/* Target controls */}
      <div className="px-4 py-3 grid grid-cols-3 gap-3">
        <Field label="Sets">
          <NumberStepper
            value={setCount}
            onChange={(v) => v != null && onSetCountChange(Math.max(1, v))}
            min={1}
            max={20}
            ariaLabel="set count"
          />
        </Field>
        <Field label="Reps">
          <NumberStepper
            value={sharedReps}
            onChange={(v) => patchAll({ targetReps: v })}
            min={0}
            max={500}
            allowNull
            ariaLabel="target reps"
          />
        </Field>
        <Field label={`Weight (${weightUnit})`}>
          <NumberStepper
            value={sharedWeight}
            onChange={(v) => patchAll({ targetWeight: v })}
            min={0}
            max={2000}
            step={5}
            allowNull
            ariaLabel="target weight"
            integer={false}
          />
        </Field>
      </div>
    </motion.div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn('text-[10px] uppercase tracking-wider font-semibold', 'text-muted-foreground')}>{label}</span>
      {children}
    </div>
  )
}
