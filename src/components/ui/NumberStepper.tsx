import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface NumberStepperProps {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  /** Allow user to clear the value entirely (returns null). Default: false. */
  allowNull?: boolean
  /** Compact display — no decimal handling. */
  integer?: boolean
  /** Suffix label (e.g. "lbs", "reps"). */
  suffix?: string
  placeholder?: string
  ariaLabel?: string
  className?: string
}

/**
 * Stepper for entering reps/weight/sets. Plus/minus buttons + tap-to-edit input.
 * The input is fully editable (no native spinners) so users can type a value
 * directly, but the - / + buttons are large tap targets for use at the gym.
 */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  allowNull = false,
  integer = true,
  suffix,
  placeholder = '—',
  ariaLabel,
  className,
}: NumberStepperProps) {
  const [text, setText] = useState<string>(value == null ? '' : String(value))

  // Sync external value changes (e.g. live query update) into the local text.
  useEffect(() => {
    setText(value == null ? '' : String(value))
  }, [value])

  const commit = useCallback((next: number | null) => {
    if (next === null) {
      if (allowNull) onChange(null)
      else onChange(min)
      return
    }
    const clamped = Math.min(Math.max(next, min), max)
    onChange(integer ? Math.round(clamped) : clamped)
  }, [onChange, min, max, integer, allowNull])

  const inc = () => commit((value ?? 0) + step)
  const dec = () => commit((value ?? 0) - step)

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={dec}
        className="h-9 w-9 flex items-center justify-center rounded-lg bg-secondary/70 text-foreground active:scale-95 transition-transform touch-target hover:bg-secondary"
        aria-label={`Decrease ${ariaLabel ?? 'value'}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      <div className="relative">
        <input
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          pattern={integer ? '[0-9]*' : '[0-9.]*'}
          value={text}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const trimmed = text.trim()
            if (trimmed === '') {
              commit(null)
              return
            }
            const n = integer ? parseInt(trimmed, 10) : parseFloat(trimmed)
            if (Number.isNaN(n)) {
              setText(value == null ? '' : String(value))
              return
            }
            commit(n)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className={cn(
            'h-9 w-14 text-center rounded-lg bg-input border border-border/40 text-sm font-semibold tabular-nums text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/60',
            suffix && 'w-16'
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={inc}
        className="h-9 w-9 flex items-center justify-center rounded-lg bg-secondary/70 text-foreground active:scale-95 transition-transform touch-target hover:bg-secondary"
        aria-label={`Increase ${ariaLabel ?? 'value'}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  )
}
