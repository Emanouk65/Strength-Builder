import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getCurrentUser,
  getExerciseRecordSummaries,
  addManualLiftRecord,
  resolveExercises,
  type ExerciseRecordSummary,
} from '@/db'
import { Button } from '@/components/ui'
import { formatDate, calculateE1RM, cn } from '@/lib/utils'
import { MAJOR_LIFTS } from '@/lib/constants'

interface RecordRow {
  exerciseId: string
  name: string
  icon: string | null
  summary: ExerciseRecordSummary | null
}

export function LiftRecords() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())

  // Live rollup: updates the moment a set is checked off mid-workout.
  const rows = useLiveQuery(
    async (): Promise<{ pinned: RecordRow[]; others: RecordRow[] } | undefined> => {
      if (!user) return undefined
      const summaries = await getExerciseRecordSummaries(user.id)
      const byId = new Map(summaries.map(s => [s.exerciseId, s]))

      const majorIds = new Set(MAJOR_LIFTS.map(l => l.id))
      const pinned: RecordRow[] = MAJOR_LIFTS.map(lift => ({
        exerciseId: lift.id,
        name: lift.name,
        icon: lift.icon,
        summary: byId.get(lift.id) ?? null,
      }))

      const otherSummaries = summaries.filter(s => !majorIds.has(s.exerciseId))
      const names = await resolveExercises(otherSummaries.map(s => s.exerciseId))
      const others: RecordRow[] = otherSummaries.map(s => ({
        exerciseId: s.exerciseId,
        name: names.get(s.exerciseId)?.name ?? s.exerciseId,
        icon: null,
        summary: s,
      }))

      return { pinned, others }
    },
    [user]
  )

  const [editingLift, setEditingLift] = useState<string | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  if (!user) return null

  const handleStartEdit = (row: RecordRow) => {
    setEditingLift(row.exerciseId)
    const pr = row.summary?.allTimePR
    setWeight(pr ? pr.weight.toString() : '')
    setReps(pr ? pr.reps.toString() : '')
  }

  const handleCancel = () => {
    setEditingLift(null)
    setWeight('')
    setReps('')
  }

  const handleSave = async (exerciseId: string) => {
    const parsedWeight = parseFloat(weight)
    const parsedReps = parseInt(reps)
    if (!Number.isFinite(parsedWeight) || !Number.isFinite(parsedReps) || parsedWeight <= 0 || parsedReps <= 0) return

    setIsSaving(true)
    try {
      await addManualLiftRecord(user.id, exerciseId, parsedWeight, parsedReps)
      handleCancel()
    } catch (error) {
      console.error('Failed to save PR:', error)
    }
    setIsSaving(false)
  }

  const renderRow = (row: RecordRow) => {
    const pr = row.summary?.allTimePR
    const latest = row.summary?.latest
    const isEditing = editingLift === row.exerciseId
    const previewE1RM = weight && reps
      ? calculateE1RM(parseFloat(weight) || 0, parseInt(reps) || 0)
      : null
    // Show "current" only when the most recent record isn't the PR itself.
    const showCurrent = pr && latest && latest.id !== pr.id && latest.estimated1RM !== pr.estimated1RM

    return (
      <motion.div
        layout
        key={row.exerciseId}
        transition={{ layout: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
        className={cn(
          'rounded-2xl bg-card border overflow-hidden',
          isEditing ? 'border-foreground/40' : 'border-border/40'
        )}
      >
        {/* Summary row */}
        <button
          onClick={() => isEditing ? handleCancel() : handleStartEdit(row)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-secondary/30 active:bg-secondary/50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {row.icon && <span className="text-2xl shrink-0">{row.icon}</span>}
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{row.name}</p>
              {pr ? (
                <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  {pr.weight} × {pr.reps} · {formatDate(pr.date)}
                  {showCurrent && latest && (
                    <span className="text-muted-foreground/70"> · now ~{latest.estimated1RM}</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">No record yet — tap to add</p>
              )}
            </div>
          </div>
          {pr && !isEditing && (
            <div className="text-right shrink-0">
              <p className="text-lg font-bold tabular-nums">{pr.estimated1RM}</p>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{user.preferences.weightUnit} e1RM</p>
            </div>
          )}
          <svg
            viewBox="0 0 24 24"
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform shrink-0',
              isEditing && 'rotate-180'
            )}
            fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <AnimatePresence initial={false}>
          {isEditing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Weight (${user.preferences.weightUnit})`}>
                    <PlainNumberInput
                      value={weight}
                      onChange={setWeight}
                      placeholder="225"
                      ariaLabel="weight"
                      autoFocus
                    />
                  </Field>
                  <Field label="Reps">
                    <PlainNumberInput
                      value={reps}
                      onChange={setReps}
                      placeholder="5"
                      ariaLabel="reps"
                    />
                  </Field>
                </div>

                {previewE1RM != null && previewE1RM > 0 && (
                  <div className="rounded-xl bg-secondary/60 border border-border/30 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Estimated 1RM</span>
                    <span className="font-bold tabular-nums">{previewE1RM} {user.preferences.weightUnit}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => handleSave(row.exerciseId)}
                    disabled={!weight || !reps || isSaving}
                    loading={isSaving}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-12 pb-5 flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors -ml-1"
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Personal records</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Lifts</h1>
        </div>
      </header>

      <div className="px-5 space-y-2.5">
        {(rows?.pinned ?? []).map(renderRow)}
      </div>

      {rows && rows.others.length > 0 && (
        <>
          <p className="px-5 mt-7 mb-2.5 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
            All logged lifts
          </p>
          <div className="px-5 space-y-2.5">
            {rows.others.map(renderRow)}
          </div>
        </>
      )}

      <div className="mt-6 mx-5 p-4 rounded-2xl bg-secondary/40 border border-border/30">
        <h3 className="font-semibold text-sm mb-1.5">About estimated 1RM</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          We use the Epley formula to estimate your one-rep max from your best lifts. Records update live as you check off sets — no need to finish the workout. The big number is your all-time best; "now" shows your most recent estimate when it differs.
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

/**
 * Plain text input with numeric keyboard — bypasses any quirks with type="number"
 * focus/autofocus on iOS PWAs.
 */
function PlainNumberInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel?: string
  autoFocus?: boolean
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      pattern="[0-9.]*"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onChange={(e) => {
        // Allow digits and a single decimal point.
        const cleaned = e.target.value.replace(/[^0-9.]/g, '')
        onChange(cleaned)
      }}
      onFocus={(e) => e.currentTarget.select()}
      className="h-12 w-full rounded-xl bg-input border border-border/40 px-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/40 tabular-nums focus:outline-none focus:ring-2 focus:ring-foreground/30 focus:border-foreground/40 transition-colors"
    />
  )
}
