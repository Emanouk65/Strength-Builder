import { useState } from 'react'
import { Sheet, Button } from '@/components/ui'
import { cn, formatDate } from '@/lib/utils'

interface ScheduleSheetProps {
  open: boolean
  onClose: () => void
  /** Receives the chosen date and an optional name. */
  onSchedule: (date: Date) => void
  /** Pre-fill the name field. */
  initialName?: string
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(8, 0, 0, 0) // default 8am
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toInputDate(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function fromInputDate(str: string): Date | null {
  if (!str) return null
  const [yyyy, mm, dd] = str.split('-').map(Number)
  if (!yyyy || !mm || !dd) return null
  const d = new Date(yyyy, mm - 1, dd, 8, 0, 0, 0)
  return d
}

export function ScheduleSheet({ open, onClose, onSchedule }: ScheduleSheetProps) {
  const today = startOfDay(new Date())
  const [customDate, setCustomDate] = useState<string>(toInputDate(today))

  const presets: Array<{ key: string; label: string; date: Date }> = [
    { key: 'today', label: 'Today', date: today },
    { key: 'tomorrow', label: 'Tomorrow', date: addDays(today, 1) },
    { key: 'in2', label: formatDate(addDays(today, 2), 'long').split(',')[0], date: addDays(today, 2) },
    { key: 'in3', label: formatDate(addDays(today, 3), 'long').split(',')[0], date: addDays(today, 3) },
  ]

  return (
    <Sheet open={open} onClose={onClose} title="Schedule workout">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          When do you want to do this workout? You'll find it ready to start on the dashboard.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {presets.map(p => (
            <button
              key={p.key}
              onClick={() => onSchedule(p.date)}
              className={cn(
                'flex flex-col items-start px-4 py-3 rounded-xl bg-secondary/50 border border-border/30',
                'text-left transition-all hover:border-primary/40 hover:bg-secondary/80 active:scale-[0.985]'
              )}
            >
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{p.label}</span>
              <span className="text-sm font-semibold text-foreground mt-0.5">
                {formatDate(p.date, 'short')}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <div className="flex-1 h-px bg-border/30" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Or pick a date</span>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        <div className="flex flex-col gap-2">
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            min={toInputDate(today)}
            className="h-11 w-full rounded-xl border border-border/50 bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/60"
          />
          <Button
            onClick={() => {
              const d = fromInputDate(customDate)
              if (d) onSchedule(d)
            }}
            className="w-full"
          >
            Schedule for this date
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
