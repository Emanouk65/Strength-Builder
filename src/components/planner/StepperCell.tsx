import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface StepperCellProps {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  integer?: boolean
  /** When false, clearing the field snaps back instead of returning null. */
  nullable?: boolean
}

/**
 * Compact number cell for the workout builder: label on top, a large
 * tap-to-type value in the middle, and a split − / + control underneath.
 * Three of these sit side by side, so editing an exercise takes one short
 * row instead of three full-width steppers.
 */
export function StepperCell({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  integer = true,
  nullable = true,
}: StepperCellProps) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => { setText(value == null ? '' : String(value)) }, [value])

  const commit = (next: number | null) => {
    if (next == null) {
      if (nullable) onChange(null)
      else setText(value == null ? '' : String(value))
      return
    }
    const clamped = Math.min(Math.max(next, min), max)
    onChange(integer ? Math.round(clamped) : Math.round(clamped * 100) / 100)
  }

  // An empty field starts from a sensible baseline instead of jumping by a step.
  const bump = (dir: 1 | -1) => commit(value == null ? (dir > 0 ? Math.max(min, step) : min) : value + dir * step)

  return (
    <div className="glass-soft rounded-2xl flex flex-col overflow-hidden">
      <span className="pt-2 text-center text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        pattern={integer ? '[0-9]*' : '[0-9.]*'}
        value={text}
        placeholder="–"
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          const t = text.trim()
          if (t === '') { commit(null); return }
          const n = integer ? parseInt(t, 10) : parseFloat(t)
          if (Number.isNaN(n)) { setText(value == null ? '' : String(value)); return }
          commit(n)
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="h-10 w-full bg-transparent text-center text-[26px] font-semibold tabular-nums tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />
      <div className="flex border-t border-white/[0.06]">
        <CellButton label={`Decrease ${label}`} onClick={() => bump(-1)}>
          <path d="M5 12h14" />
        </CellButton>
        <span className="w-px bg-white/[0.06]" />
        <CellButton label={`Increase ${label}`} onClick={() => bump(1)}>
          <path d="M12 5v14M5 12h14" />
        </CellButton>
      </div>
    </div>
  )
}

function CellButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex-1 h-10 flex items-center justify-center text-foreground/75',
        'hover:bg-white/[0.06] active:bg-white/10 active:text-foreground transition-colors touch-manipulation'
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">{children}</svg>
    </button>
  )
}
