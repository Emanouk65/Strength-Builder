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
  placeholder?: string
  ariaLabel?: string
  /** 'sm' (h-9 default), 'md' (h-11), 'lg' (h-14 — for prominent planner inputs). */
  size?: 'sm' | 'md' | 'lg'
  /** Render the buttons + input in a single connected pill instead of separate. */
  pill?: boolean
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
  placeholder = '—',
  ariaLabel,
  size = 'sm',
  pill = false,
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

  const sizes = {
    sm: { btn: 'h-9 w-9', icon: 'h-4 w-4', input: 'h-9 w-14 text-sm', gap: 'gap-1' },
    md: { btn: 'h-11 w-11', icon: 'h-4 w-4', input: 'h-11 w-16 text-base', gap: 'gap-1.5' },
    lg: { btn: 'h-14 w-14', icon: 'h-5 w-5', input: 'h-14 w-20 text-2xl font-bold', gap: 'gap-0' },
  }
  const s = sizes[size]

  if (pill) {
    return (
      <div
        className={cn(
          'inline-flex items-stretch overflow-hidden rounded-2xl bg-card border border-border/60',
          'shadow-sm',
          className
        )}
      >
        <button
          type="button"
          onClick={dec}
          className={cn(
            s.btn,
            'flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-secondary/60 active:bg-secondary/80 active:scale-95 transition-all touch-target border-r border-border/60'
          )}
          aria-label={`Decrease ${ariaLabel ?? 'value'}`}
        >
          <svg viewBox="0 0 24 24" className={s.icon} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
        <input
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          pattern={integer ? '[0-9]*' : '[0-9.]*'}
          value={text}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            const trimmed = text.trim()
            if (trimmed === '') { commit(null); return }
            const n = integer ? parseInt(trimmed, 10) : parseFloat(trimmed)
            if (Number.isNaN(n)) { setText(value == null ? '' : String(value)); return }
            commit(n)
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={cn(
            s.input,
            'flex-1 min-w-0 bg-transparent text-center tabular-nums text-foreground font-bold',
            'focus:outline-none'
          )}
        />
        <button
          type="button"
          onClick={inc}
          className={cn(
            s.btn,
            'flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-secondary/60 active:bg-secondary/80 active:scale-95 transition-all touch-target border-l border-border/60'
          )}
          aria-label={`Increase ${ariaLabel ?? 'value'}`}
        >
          <svg viewBox="0 0 24 24" className={s.icon} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    )
  }

  return (
    <div className={cn('inline-flex items-center', s.gap, className)}>
      <button
        type="button"
        onClick={dec}
        className={cn(
          s.btn,
          'flex items-center justify-center rounded-xl bg-secondary/70 text-foreground active:scale-95 transition-transform touch-target hover:bg-secondary'
        )}
        aria-label={`Decrease ${ariaLabel ?? 'value'}`}
      >
        <svg viewBox="0 0 24 24" className={s.icon} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      <input
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        pattern={integer ? '[0-9]*' : '[0-9.]*'}
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          const trimmed = text.trim()
          if (trimmed === '') { commit(null); return }
          const n = integer ? parseInt(trimmed, 10) : parseFloat(trimmed)
          if (Number.isNaN(n)) { setText(value == null ? '' : String(value)); return }
          commit(n)
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className={cn(
          s.input,
          'text-center rounded-xl bg-input border border-border/40 tabular-nums text-foreground font-semibold',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/60'
        )}
      />
      <button
        type="button"
        onClick={inc}
        className={cn(
          s.btn,
          'flex items-center justify-center rounded-xl bg-secondary/70 text-foreground active:scale-95 transition-transform touch-target hover:bg-secondary'
        )}
        aria-label={`Increase ${ariaLabel ?? 'value'}`}
      >
        <svg viewBox="0 0 24 24" className={s.icon} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  )
}
