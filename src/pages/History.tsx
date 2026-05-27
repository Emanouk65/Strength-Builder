import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { db, getCurrentUser, getRecentReflections, getRecentCheckIns } from '@/db'
import { Badge, Button } from '@/components/ui'
import { formatDate, getLocalDateString, cn, listMotion, cardMotion } from '@/lib/utils'
import type { WorkoutReflection, Workout, DailyCheckIn } from '@/lib/types'

export function History() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())

  // Pull a generous window so the calendar can show several weeks of data.
  const recentWorkouts = useLiveQuery(
    async (): Promise<Workout[]> => {
      if (!user) return []
      const since = new Date()
      since.setDate(since.getDate() - 60)
      const all = await db.workouts
        .where('status').equals('completed')
        .filter((w) => Boolean(w.completedAt && new Date(w.completedAt) >= since))
        .toArray()
      return all.sort((a, b) =>
        new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
      )
    },
    [user]
  )

  const reflections = useLiveQuery(
    async (): Promise<WorkoutReflection[]> => {
      if (!recentWorkouts || recentWorkouts.length === 0) return []
      const ids = recentWorkouts.map((w) => w.id)
      return db.workoutReflections.where('workoutId').anyOf(ids).toArray()
    },
    [recentWorkouts]
  )

  const recentCheckIns = useLiveQuery(
    async (): Promise<DailyCheckIn[]> => (user ? getRecentCheckIns(user.id, 60) : []),
    [user]
  )

  const recent2WeekReflections = useLiveQuery(
    async (): Promise<WorkoutReflection[]> => (user ? getRecentReflections(user.id, 14) : []),
    [user]
  )

  const reflectionByWorkoutId = useMemo(() => {
    const m = new Map<string, WorkoutReflection>()
    ;(reflections ?? []).forEach((r) => m.set(r.workoutId, r))
    return m
  }, [reflections])

  // ── Trend averages (last 2 weeks). Each is computed only from reflections that
  // actually carry that field as a positive number — keeps the "random 0" off
  // the screen when a field wasn't filled in.
  const trends = useMemo(() => {
    const list = recent2WeekReflections ?? []
    const validEnergy = list.filter((r) => r.energy > 0)
    const validPerf = list.filter((r) => r.performance > 0)
    const validSleep = list.filter((r) => r.sleepHours > 0)

    return {
      sessions: list.length,
      avgEnergy: validEnergy.length
        ? validEnergy.reduce((s, r) => s + r.energy, 0) / validEnergy.length
        : null,
      avgPerformance: validPerf.length
        ? validPerf.reduce((s, r) => s + r.performance, 0) / validPerf.length
        : null,
      avgSleep: validSleep.length
        ? validSleep.reduce((s, r) => s + r.sleepHours, 0) / validSleep.length
        : null,
    }
  }, [recent2WeekReflections])

  if (!user) return null

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-12 pb-5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Looking back</p>
        <h1 className="text-2xl font-bold tracking-tight mt-1">History</h1>
      </header>

      {/* Calendar */}
      <div className="px-5 mb-5">
        <CalendarView
          workouts={recentWorkouts ?? []}
          checkIns={recentCheckIns ?? []}
          reflections={reflections ?? []}
          onSelectWorkout={(id) => navigate(`/workout/${id}`)}
          onCheckIn={() => navigate('/check-in')}
        />
      </div>

      {/* Trends */}
      {trends.sessions > 0 && (trends.avgEnergy != null || trends.avgPerformance != null || trends.avgSleep != null) && (
        <div className="px-5 mb-5">
          <div className="rounded-2xl bg-card border border-border/40 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Last 2 weeks</p>
              <span className="text-[10px] text-muted-foreground">{trends.sessions} {trends.sessions === 1 ? 'session' : 'sessions'}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <TrendStat label="Energy" value={trends.avgEnergy} suffix="/10" />
              <TrendStat label="Felt" value={trends.avgPerformance} suffix="/10" />
              <TrendStat label="Sleep" value={trends.avgSleep} suffix="h" />
            </div>
          </div>
        </div>
      )}

      {/* Workout journal entries */}
      <div className="px-5">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-3">Recent workouts</p>

        {recentWorkouts && recentWorkouts.length > 0 ? (
          <motion.div className="space-y-2.5" {...listMotion}>
            {recentWorkouts.slice(0, 20).map((workout) => {
              const reflection = reflectionByWorkoutId.get(workout.id)
              return (
                <motion.button
                  key={workout.id}
                  {...cardMotion}
                  onClick={() => navigate(`/workout/${workout.id}`)}
                  className="w-full text-left rounded-2xl bg-card border border-border/40 hover:border-foreground/25 transition-colors active:scale-[0.99] p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground truncate">{workout.name || 'Workout'}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {workout.completedAt ? formatDate(workout.completedAt, 'long') : '—'}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">Complete</Badge>
                  </div>

                  {reflection ? (
                    <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                      <div className="flex items-center gap-3 text-xs">
                        {reflection.overallSatisfaction > 0 && (
                          <span className="text-muted-foreground">
                            Felt <span className="text-foreground font-semibold">{reflection.overallSatisfaction}/10</span>
                          </span>
                        )}
                        {reflection.energy > 0 && (
                          <span className="text-muted-foreground">
                            Energy <span className="text-foreground font-semibold">{reflection.energy}/10</span>
                          </span>
                        )}
                      </div>
                      {reflection.freeformNotes && (
                        <p className="text-sm text-foreground/85 line-clamp-2 leading-snug">
                          {reflection.freeformNotes}
                        </p>
                      )}
                      {!reflection.freeformNotes && reflection.winOfTheDay && (
                        <p className="text-sm text-foreground/85 line-clamp-2 leading-snug">
                          <span className="text-muted-foreground">Win: </span>{reflection.winOfTheDay}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/70 italic">No journal entry</p>
                  )}
                </motion.button>
              )
            })}
          </motion.div>
        ) : (
          <div className="rounded-2xl bg-card border border-border/40 py-10 text-center">
            <p className="text-muted-foreground">No completed workouts yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Your training history will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Trend stat (handles "no data" gracefully) ───────────────────────────────

function TrendStat({ label, value, suffix }: { label: string; value: number | null; suffix: string }) {
  return (
    <div className="text-left">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      {value == null ? (
        <p className="text-2xl font-bold tabular-nums mt-1 text-muted-foreground/60">—</p>
      ) : (
        <p className="text-2xl font-bold tabular-nums mt-1">
          {value.toFixed(1)}
          <span className="text-sm font-normal text-muted-foreground ml-0.5">{suffix}</span>
        </p>
      )}
    </div>
  )
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function CalendarView({
  workouts,
  checkIns,
  reflections,
  onSelectWorkout,
  onCheckIn,
}: {
  workouts: Workout[]
  checkIns: DailyCheckIn[]
  reflections: WorkoutReflection[]
  onSelectWorkout: (id: string) => void
  onCheckIn: () => void
}) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const today = new Date()
  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const monthName = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const reflectionByWorkoutId = useMemo(() => {
    const m = new Map<string, WorkoutReflection>()
    reflections.forEach((r) => m.set(r.workoutId, r))
    return m
  }, [reflections])

  // Build the calendar grid: 6 rows × 7 columns starting from Sunday before the
  // first of the month.
  const grid = useMemo(() => {
    const firstOfMonth = new Date(viewMonth)
    const startWeekday = firstOfMonth.getDay() // 0 = Sunday
    const start = new Date(firstOfMonth)
    start.setDate(start.getDate() - startWeekday)

    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d)
    }
    return days
  }, [viewMonth])

  const workoutsByDate = useMemo(() => {
    const m = new Map<string, Workout[]>()
    workouts.forEach((w) => {
      if (!w.completedAt) return
      const key = getLocalDateString(new Date(w.completedAt))
      const list = m.get(key) ?? []
      list.push(w)
      m.set(key, list)
    })
    return m
  }, [workouts])

  const checkInsByDate = useMemo(() => {
    const m = new Map<string, DailyCheckIn>()
    checkIns.forEach((c) => m.set(c.date, c))
    return m
  }, [checkIns])

  const todayKey = getLocalDateString(today)
  const selectedWorkouts = selectedDay ? (workoutsByDate.get(selectedDay) ?? []) : []
  const selectedCheckIn = selectedDay ? checkInsByDate.get(selectedDay) : undefined
  const selectedDate = selectedDay ? new Date(selectedDay + 'T12:00:00') : null

  return (
    <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
      {/* Month header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <button
          onClick={() => setMonthOffset((n) => n - 1)}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          aria-label="Previous month"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <p className="text-sm font-semibold text-foreground">{monthName}</p>
        <button
          onClick={() => setMonthOffset((n) => n + 1)}
          disabled={monthOffset >= 0}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Next month"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-2 pt-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="py-1">{d}</span>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 px-2 pb-2 gap-1">
        {grid.map((d) => {
          const key = getLocalDateString(d)
          const inMonth = d.getMonth() === viewMonth.getMonth()
          const isToday = key === todayKey
          const isSelected = selectedDay === key
          const future = d.getTime() > today.getTime() && !isToday
          const dayWorkouts = workoutsByDate.get(key) ?? []
          const checkIn = checkInsByDate.get(key)
          const reflection = dayWorkouts[0] ? reflectionByWorkoutId.get(dayWorkouts[0].id) : undefined

          // Color intensity reflects "felt" rating if available.
          const intensity = reflection?.overallSatisfaction ?? null

          return (
            <button
              key={key}
              onClick={() => !future && inMonth && setSelectedDay(isSelected ? null : key)}
              disabled={!inMonth || future}
              className={cn(
                'aspect-square flex flex-col items-center justify-center rounded-lg text-sm relative transition-colors',
                inMonth ? 'text-foreground' : 'text-muted-foreground/30',
                future && 'opacity-40',
                !inMonth && 'pointer-events-none',
                isToday && !isSelected && 'ring-1 ring-foreground/40',
                isSelected && 'bg-foreground text-background',
                !isSelected && dayWorkouts.length > 0 && 'bg-foreground/15 hover:bg-foreground/25',
                !isSelected && dayWorkouts.length === 0 && checkIn && 'bg-secondary/60 hover:bg-secondary',
                !isSelected && dayWorkouts.length === 0 && !checkIn && inMonth && !future && 'hover:bg-secondary/40'
              )}
              aria-label={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${dayWorkouts.length ? ' — workout' : ''}${checkIn ? ' — check-in' : ''}`}
            >
              <span className={cn('font-mono tabular-nums', isToday && !isSelected && 'font-bold')}>
                {d.getDate()}
              </span>
              {/* Dots row — workout / check-in markers */}
              <div className="absolute bottom-0.5 left-0 right-0 flex items-center justify-center gap-0.5 h-1.5">
                {dayWorkouts.length > 0 && (
                  <span className={cn(
                    'h-1 w-1 rounded-full',
                    isSelected ? 'bg-background' : intensity != null && intensity >= 8 ? 'bg-foreground' : 'bg-foreground/70'
                  )} />
                )}
                {checkIn && (
                  <span className={cn(
                    'h-1 w-1 rounded-full',
                    isSelected ? 'bg-background/70' : 'bg-muted-foreground'
                  )} />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-4 pb-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" /> Workout
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Check-in
        </span>
      </div>

      {/* Selected-day detail */}
      <AnimatePresence initial={false}>
        {selectedDay && selectedDate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-border/30"
          >
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>

              {selectedWorkouts.length === 0 && !selectedCheckIn && (
                <div className="py-2 text-center">
                  <p className="text-xs text-muted-foreground">Nothing logged this day</p>
                  {selectedDay === todayKey && (
                    <Button size="sm" variant="outline" onClick={onCheckIn} className="mt-2">
                      Daily check-in
                    </Button>
                  )}
                </div>
              )}

              {selectedWorkouts.map((w) => {
                const r = reflectionByWorkoutId.get(w.id)
                return (
                  <button
                    key={w.id}
                    onClick={() => onSelectWorkout(w.id)}
                    className="w-full text-left rounded-xl bg-secondary/40 hover:bg-secondary/60 transition-colors p-3"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-sm font-semibold truncate">{w.name || 'Workout'}</p>
                      {r && r.overallSatisfaction > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{r.overallSatisfaction}/10</span>
                      )}
                    </div>
                    {r?.freeformNotes && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">{r.freeformNotes}</p>
                    )}
                    {!r?.freeformNotes && r?.winOfTheDay && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">{r.winOfTheDay}</p>
                    )}
                  </button>
                )
              })}

              {selectedCheckIn && (
                <div className="rounded-xl bg-secondary/40 p-3">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">Daily check-in</p>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    {selectedCheckIn.energy > 0 && (
                      <CheckInStat label="Energy" value={selectedCheckIn.energy} suffix="/10" />
                    )}
                    {selectedCheckIn.mood > 0 && (
                      <CheckInStat label="Mood" value={selectedCheckIn.mood} suffix="/10" />
                    )}
                    {selectedCheckIn.sleepHours > 0 && (
                      <CheckInStat label="Sleep" value={selectedCheckIn.sleepHours} suffix="h" />
                    )}
                    {selectedCheckIn.soreness > 0 && (
                      <CheckInStat label="Soreness" value={selectedCheckIn.soreness} suffix="/10" />
                    )}
                    {selectedCheckIn.stress > 0 && (
                      <CheckInStat label="Stress" value={selectedCheckIn.stress} suffix="/10" />
                    )}
                    {selectedCheckIn.motivation > 0 && (
                      <CheckInStat label="Motivation" value={selectedCheckIn.motivation} suffix="/10" />
                    )}
                  </div>
                  {selectedCheckIn.highlight && (
                    <p className="text-xs text-foreground/85 mt-2 pt-2 border-t border-border/30">
                      <span className="text-muted-foreground">Highlight: </span>{selectedCheckIn.highlight}
                    </p>
                  )}
                  {selectedCheckIn.challenge && (
                    <p className="text-xs text-foreground/85 mt-1.5">
                      <span className="text-muted-foreground">Challenge: </span>{selectedCheckIn.challenge}
                    </p>
                  )}
                  {selectedCheckIn.gratitude && (
                    <p className="text-xs text-foreground/85 mt-1.5">
                      <span className="text-muted-foreground">Gratitude: </span>{selectedCheckIn.gratitude}
                    </p>
                  )}
                  {selectedCheckIn.notes && (
                    <p className="text-xs text-foreground/85 mt-1.5">{selectedCheckIn.notes}</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CheckInStat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums mt-0.5">
        {value}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{suffix}</span>
      </p>
    </div>
  )
}
