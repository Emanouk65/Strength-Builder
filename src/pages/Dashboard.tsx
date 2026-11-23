import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { db, resolveExercises, getCurrentUser, getNextProgramWorkout, getMissedProgramWorkouts, getActiveProgram, skipWorkout, getRecentReflections, getTodaysCheckIn, getRecentCheckIns, getDraftWorkout, getScheduledWorkouts } from '@/db'
import { Button, Skeleton } from '@/components/ui'
import { formatDate, cn, getShortDayName, getLocalDateString, getExerciseInputKind } from '@/lib/utils'
import type { WorkoutReflection, Workout, DailyCheckIn } from '@/lib/types'

export function Dashboard() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())
  const nextWorkout = useLiveQuery(
    async () => {
      if (!user) return null
      return (await getNextProgramWorkout(user.id)) ?? null
    },
    [user]
  )

  const activeProgram = useLiveQuery(
    async () => {
      if (!user) return null
      return (await getActiveProgram(user.id)) ?? null
    },
    [user]
  )

  const missedWorkouts = useLiveQuery(
    async () => {
      if (!user) return []
      return getMissedProgramWorkouts(user.id)
    },
    [user]
  )
  const recentReflections = useLiveQuery(
    async () => {
      if (!user) return []
      return getRecentReflections(user.id, 7)
    },
    [user]
  )
  const recentWorkouts = useLiveQuery(
    async () => {
      if (!user) return []
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return db.workouts
        .where('status')
        .equals('completed')
        .filter((w) => Boolean(w.completedAt && new Date(w.completedAt) >= thirtyDaysAgo))
        .toArray()
    },
    [user]
  )

  const thisWeekData = useLiveQuery(
    async () => {
      if (!user) return { workouts: [] as Workout[], totalSets: 0 }
      const today = new Date()
      const dayOfWeek = today.getDay()
      const startOfWeek = new Date(today)
      startOfWeek.setDate(today.getDate() - dayOfWeek)
      startOfWeek.setHours(0, 0, 0, 0)
      const workouts = await db.workouts
        .where('status')
        .equals('completed')
        .filter((w) => Boolean(w.completedAt && new Date(w.completedAt) >= startOfWeek))
        .toArray()
      let totalSets = 0
      if (workouts.length > 0) {
        // Unified counting: SetInstances are the source of truth post-v5.
        const workoutIds = workouts.map(w => w.id)
        const blocks = await db.workoutBlocks.where('workoutId').anyOf(workoutIds).toArray()
        const blockIds = blocks.map(b => b.id)
        if (blockIds.length > 0) {
          const instances = await db.exerciseInstances.where('blockId').anyOf(blockIds).toArray()
          const instanceIds = instances.map(i => i.id)
          if (instanceIds.length > 0) {
            totalSets = await db.setInstances
              .where('exerciseInstanceId').anyOf(instanceIds)
              .filter(s => s.completed)
              .count()
          }
        }
      }
      return { workouts, totalSets }
    },
    [user]
  )

  const thisWeekWorkouts = thisWeekData?.workouts
  const thisWeekSets = thisWeekData?.totalSets ?? 0

  const todaysCheckIn = useLiveQuery(
    async () => {
      if (!user) return null
      return (await getTodaysCheckIn(user.id)) ?? null
    },
    [user]
  )

  const recentCheckIns = useLiveQuery(
    async () => {
      if (!user) return []
      return getRecentCheckIns(user.id, 7)
    },
    [user]
  )

  const draftWorkout = useLiveQuery(
    async () => {
      if (!user) return null
      return (await getDraftWorkout(user.id)) ?? null
    },
    [user]
  )

  const readyToGo = useLiveQuery(
    async () => {
      if (!user) return [] as Workout[]
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const end = new Date(start); end.setDate(end.getDate() + 7)
      // Only show user-scheduled workouts — program workouts (programId set)
      // surface via the NextWorkoutCard hero instead.
      const list = await getScheduledWorkouts(user.id, start, end)
      return list.filter(w => w.weekId === null && !w.programId)
    },
    [user]
  )

  // Main lifts for the hero: the first few exercises outside the warm-up.
  const heroLifts = useLiveQuery(
    async () => {
      if (!nextWorkout || nextWorkout.status === 'completed') return [] as { name: string; sets: number; prep: boolean }[]
      const blocks = (await db.workoutBlocks.where('workoutId').equals(nextWorkout.id).toArray())
        .filter(b => b.type !== 'warmup' && b.type !== 'cooldown')
        .sort((x, y) => x.order - y.order)
      if (blocks.length === 0) return []
      const instances = await db.exerciseInstances.where('blockId').anyOf(blocks.map(b => b.id)).toArray()
      const blockOrder = new Map(blocks.map(b => [b.id, b.order]))
      instances.sort((x, y) => (blockOrder.get(x.blockId)! - blockOrder.get(y.blockId)!) || x.order - y.order)
      const exercises = await resolveExercises(instances.map(i => i.exerciseId))
      const counts = await Promise.all(instances.map(i =>
        db.setInstances.where('exerciseInstanceId').equals(i.id).filter(s => s.setType !== 'warmup').count()))
      // Lifting first; mobility and cardio prep fold into "+N more".
      const prep = (id: string) => {
        const ex = exercises.get(id)
        return !ex || ex.category === 'mobility' || getExerciseInputKind(ex) === 'cardio'
      }
      return instances
        .map((i, idx) => ({ name: exercises.get(i.exerciseId)?.name ?? 'Exercise', sets: counts[idx], prep: prep(i.exerciseId) }))
        .sort((a, b) => Number(a.prep) - Number(b.prep))
    },
    [nextWorkout?.id, nextWorkout?.status]
  )

  const upcomingProgram = useLiveQuery(
    async () => {
      if (!user || !activeProgram) return [] as Workout[]
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const end = new Date(start); end.setDate(end.getDate() + 7)
      const list = await getScheduledWorkouts(user.id, start, end)
      return list.filter(w => w.programId === activeProgram.id)
    },
    [user?.id, activeProgram?.id]
  )

  const weeklyStats = useMemo(
    () => calculateWeeklyStats(thisWeekWorkouts || [], recentReflections || [], thisWeekSets),
    [thisWeekWorkouts, recentReflections, thisWeekSets]
  )

  const currentStreak = useMemo(() => {
    if (!user) return 0
    const todayStr = getLocalDateString()
    const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterdayStr = getLocalDateString(yesterdayDate)
    const lastWorkoutDate = user.lastWorkoutDate ?? ''
    const isStreakActive = lastWorkoutDate === todayStr || lastWorkoutDate === yesterdayStr
    return isStreakActive ? (user.currentStreak ?? 0) : 0
  }, [user?.lastWorkoutDate, user?.currentStreak])

  // First paint: user query hasn't resolved yet — show a skeleton instead of
  // a blank flash. (null means no user at all; App routes that to onboarding.)
  if (user === undefined) {
    return (
      <div className="flex flex-col">
        <div className="px-4 pt-12 pb-6 border-b border-border/30">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-40 mt-2" />
        </div>
        <div className="flex flex-col gap-5 px-4 pt-5 pb-8">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }
  if (!user) return null

  const today = new Date()
  const dateLabel = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  // Program sessions after the hero, plus anything the user scheduled themselves.
  const upNext = [
    ...(upcomingProgram ?? []).filter(w => w.id !== nextWorkout?.id),
    ...(readyToGo ?? []),
  ].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="px-5 pt-14 pb-5 flex items-end justify-between">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1 className="mt-1 text-[34px] font-bold leading-none tracking-tight text-foreground">Today</h1>
        </div>
        <div className="flex items-center gap-2">
          {currentStreak > 0 && (
            <span className="glass-soft rounded-full h-9 px-3 flex items-center gap-1.5 text-[13px] font-semibold tabular-nums">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-orange-400" fill="currentColor"><path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z" /></svg>
              {currentStreak}
            </span>
          )}
          <button
            onClick={() => navigate('/settings')}
            aria-label="Settings"
            className="glass-soft rounded-full h-9 w-9 flex items-center justify-center text-foreground/80 active:scale-95 transition-transform"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 pb-8">
        <NextWorkoutCard
          nextWorkout={nextWorkout}
          programName={activeProgram?.name ?? null}
          lifts={heroLifts ?? []}
          onStart={(id) => navigate(`/workout/${id}`)}
          onEdit={(id) => navigate(`/plan/${id}`)}
          onStartFree={() => navigate('/plan')}
          onOpenProgram={() => navigate('/coach')}
        />

        <DailyCheckInCard checkIn={todaysCheckIn} onCheckIn={() => navigate('/check-in')} />

        {draftWorkout && (
          <ResumeDraftCard workout={draftWorkout} onResume={() => navigate(`/plan/${draftWorkout.id}`)} />
        )}

        {missedWorkouts && missedWorkouts.length > 0 && (
          <MissedWorkoutsCard
            workouts={missedWorkouts}
            onSkip={async (workoutId) => { await skipWorkout(workoutId, 'Skipped from dashboard') }}
            onCatchUp={(workoutId) => navigate(`/workout/${workoutId}`)}
          />
        )}

        <WeeklyCalendar
          workouts={recentWorkouts || []}
          checkIns={recentCheckIns || []}
          missedWorkouts={missedWorkouts || []}
          stats={weeklyStats}
        />

        {upNext.length > 0 && (
          <UpNextList
            workouts={upNext}
            onStart={(id) => navigate(`/workout/${id}`)}
            onEdit={(id) => navigate(`/plan/${id}`)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ease = [0.32, 0.72, 0, 1] as const

/** Program names often carry "· Wk N"; the card shows the week separately. */
function cleanName(name: string): string {
  return name.replace(/\s*[·•-]\s*W(?:ee)?k\s*\d+\s*$/i, '').trim()
}

function NextWorkoutCard({
  nextWorkout,
  programName,
  lifts,
  onStart,
  onEdit,
  onStartFree,
  onOpenProgram,
}: {
  nextWorkout: Workout | null | undefined
  programName: string | null
  lifts: { name: string; sets: number; prep: boolean }[]
  onStart: (id: string) => void
  onEdit: (id: string) => void
  onStartFree: () => void
  onOpenProgram: () => void
}) {
  if (nextWorkout === undefined) return <Skeleton className="h-56 w-full rounded-4xl" />

  if (nextWorkout && nextWorkout.status !== 'completed') {
    const isToday = isWorkoutToday(nextWorkout.scheduledDate)
    const isInProgress = nextWorkout.status === 'in_progress'
    const when = isInProgress ? 'In progress' : isToday ? 'Today' : formatDate(nextWorkout.scheduledDate, 'long')
    const meta = [
      programName && nextWorkout.programWeek != null ? `Week ${nextWorkout.programWeek}` : null,
      programName,
    ].filter(Boolean).join(' · ')
    const shown = lifts.filter(l => !l.prep).slice(0, 4)
    const more = lifts.length - shown.length

    return (
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="glass-hero rounded-4xl p-5 overflow-hidden isolate"
      >
        <div className="flex items-center justify-between">
          <p className={cn('eyebrow', isInProgress && 'text-sky-300')}>{when}</p>
          <button
            onClick={() => onEdit(nextWorkout.id)}
            className="text-[13px] font-medium text-foreground/70 hover:text-foreground -mr-1 px-1"
          >
            Edit
          </button>
        </div>
        <h2 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight text-foreground">
          {cleanName(nextWorkout.name)}
        </h2>
        {meta && <p className="mt-0.5 text-[13px] text-muted-foreground">{meta}</p>}

        {shown.length > 0 && (
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {shown.map((l, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-[15px]">
                <span className="truncate text-foreground/90">{l.name}</span>
                <span className="ml-3 shrink-0 tabular-nums text-muted-foreground">{l.sets} {l.sets === 1 ? 'set' : 'sets'}</span>
              </li>
            ))}
            {more > 0 && (
              <li className="py-2 text-[13px] text-muted-foreground">+{more} more</li>
            )}
          </ul>
        )}

        <Button className="mt-4 w-full" size="lg" onClick={() => onStart(nextWorkout.id)}>
          {isInProgress ? 'Continue' : 'Start'}
        </Button>
      </motion.section>
    )
  }

  // Nothing scheduled (or today's session is done).
  const done = nextWorkout?.status === 'completed'
  return (
    <section className="glass-hero rounded-4xl p-5 overflow-hidden">
      <p className="eyebrow">{done ? 'Done today' : 'Nothing scheduled'}</p>
      <h2 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight text-foreground">
        {done ? cleanName(nextWorkout!.name) : 'Open day'}
      </h2>
      <div className="mt-5 flex gap-2">
        <Button className="flex-1" size="lg" onClick={onStartFree}>Build a workout</Button>
        {!programName && !done && (
          <Button variant="secondary" size="lg" className="flex-1" onClick={onOpenProgram}>Program</Button>
        )}
      </div>
    </section>
  )
}

function RowButton({ onClick, children, className }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'glass rounded-3xl w-full text-left px-4 py-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform',
        className
      )}
    >
      {children}
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
    </button>
  )
}

function RowIcon({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <span className={cn(
      'h-9 w-9 shrink-0 rounded-full flex items-center justify-center',
      tone === 'warn' ? 'bg-amber-400/15 text-amber-300' : 'bg-white/[0.08] text-foreground/85'
    )}>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </span>
  )
}

function DailyCheckInCard({
  checkIn,
  onCheckIn,
}: {
  checkIn: DailyCheckIn | null | undefined
  onCheckIn: () => void
}) {
  if (checkIn === undefined) return null
  return (
    <RowButton onClick={onCheckIn}>
      <RowIcon><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></RowIcon>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-foreground">Check-in</p>
        {checkIn ? (
          <p className="text-[13px] tabular-nums text-muted-foreground">
            Energy {checkIn.energy} · Sleep {checkIn.sleepHours}h · Mood {checkIn.mood}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">Not logged</p>
        )}
      </div>
    </RowButton>
  )
}

function ResumeDraftCard({ workout, onResume }: { workout: Workout; onResume: () => void }) {
  const editedAgo = useMemo(() => {
    if (!workout.lastEditedAt) return null
    const diffMs = Date.now() - new Date(workout.lastEditedAt).getTime()
    const mins = Math.floor(diffMs / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }, [workout.lastEditedAt])

  return (
    <RowButton onClick={onResume}>
      <RowIcon><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></RowIcon>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-foreground truncate">{workout.name || 'Draft'}</p>
        <p className="text-[13px] text-muted-foreground">Draft{editedAgo ? ` · ${editedAgo}` : ''}</p>
      </div>
    </RowButton>
  )
}

function MissedWorkoutsCard({
  workouts,
  onSkip,
  onCatchUp,
}: {
  workouts: Workout[]
  onSkip: (workoutId: string) => void
  onCatchUp: (workoutId: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass rounded-3xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 py-3.5 flex items-center gap-3">
        <RowIcon tone="warn"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></RowIcon>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">{workouts.length} missed</p>
          <p className="text-[13px] text-muted-foreground truncate">{workouts.map(w => cleanName(w.name)).join(', ')}</p>
        </div>
        <svg viewBox="0 0 24 24" className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 flex flex-col gap-1.5">
              {workouts.map((w) => (
                <div key={w.id} className="glass-soft rounded-2xl flex items-center gap-2 pl-3.5 pr-1.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{cleanName(w.name)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(w.scheduledDate, 'short')}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onSkip(w.id)}>Skip</Button>
                  <Button size="sm" onClick={() => onCatchUp(w.id)}>Do it</Button>
                </div>
              ))}
              {workouts.length > 1 && (
                <button
                  onClick={() => workouts.forEach(w => onSkip(w.id))}
                  className="mt-1 h-9 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Skip all
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function WeeklyCalendar({
  workouts,
  checkIns,
  missedWorkouts,
  stats,
}: {
  workouts: Workout[]
  checkIns: DailyCheckIn[]
  missedWorkouts: Workout[]
  stats: { workoutsCompleted: number; totalMinutes: number; totalSets: number }
}) {
  const today = new Date()
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - today.getDay() + i)
    return d
  })
  const done = new Set(workouts.filter(w => w.completedAt).map(w => new Date(w.completedAt!).toDateString()))
  const missed = new Set(missedWorkouts.map(w => new Date(w.scheduledDate).toDateString()))
  const checked = new Set(checkIns.map(c => new Date(c.date).toDateString()))

  return (
    <section className="glass rounded-3xl px-3 pt-3 pb-2.5">
      <div className="grid grid-cols-7">
        {weekDates.map((date, i) => {
          const key = date.toDateString()
          const isToday = key === today.toDateString()
          const hasWorkout = done.has(key)
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{getShortDayName(date.getDay()).slice(0, 1)}</span>
              <span className={cn(
                'h-9 w-9 rounded-full flex items-center justify-center text-[15px] font-semibold tabular-nums',
                isToday ? 'bg-white text-black' : hasWorkout ? 'bg-white/[0.12] text-foreground' : 'text-foreground/70'
              )}>
                {date.getDate()}
              </span>
              <span className="h-1.5 flex items-center gap-0.5" aria-hidden>
                {hasWorkout && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                {!hasWorkout && missed.has(key) && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                {checked.has(key) && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
              </span>
            </div>
          )
        })}
      </div>
      {stats.workoutsCompleted > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-3 text-center">
          <Stat value={stats.workoutsCompleted} label={stats.workoutsCompleted === 1 ? 'workout' : 'workouts'} />
          <Stat value={stats.totalSets} label="sets" />
          <Stat value={stats.totalMinutes} label="min" />
        </div>
      )}
    </section>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <span className="text-[17px] font-semibold tabular-nums text-foreground">{value}</span>
      <span className="ml-1 text-[13px] text-muted-foreground">{label}</span>
    </div>
  )
}

function UpNextList({ workouts, onStart, onEdit }: {
  workouts: Workout[]
  onStart: (id: string) => void
  onEdit: (id: string) => void
}) {
  return (
    <section className="mt-2">
      <p className="eyebrow px-2 mb-2">This week</p>
      <div className="glass rounded-3xl divide-y divide-white/[0.06] overflow-hidden">
        {workouts.map(w => {
          const sched = new Date(w.scheduledDate)
          const isToday = sched.toDateString() === new Date().toDateString()
          const isTomorrow = sched.toDateString() === new Date(Date.now() + 86400000).toDateString()
          const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : sched.toLocaleDateString(undefined, { weekday: 'long' })
          return (
            <div key={w.id} className="flex items-center gap-3 pl-4 pr-2 py-2.5">
              <button onClick={() => onEdit(w.id)} className="min-w-0 flex-1 text-left">
                <p className="text-[15px] font-medium text-foreground truncate">{cleanName(w.name || 'Workout')}</p>
                <p className="text-[13px] text-muted-foreground">{label}</p>
              </button>
              {isToday && <Button size="sm" onClick={() => onStart(w.id)}>Start</Button>}
              {!isToday && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWorkoutToday(scheduledDate: Date): boolean {
  const today = new Date()
  const scheduled = new Date(scheduledDate)
  return (
    today.getDate() === scheduled.getDate() &&
    today.getMonth() === scheduled.getMonth() &&
    today.getFullYear() === scheduled.getFullYear()
  )
}

function calculateWeeklyStats(
  workouts: Workout[],
  reflections: WorkoutReflection[],
  totalSets: number
): { workoutsCompleted: number; totalMinutes: number; totalSets: number; avgPerformance: number } {
  const workoutsCompleted = workouts.length
  const totalMinutes = workouts.reduce((acc, w) => acc + (w.totalDuration || 0), 0)

  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const thisWeekReflections = reflections.filter(r => new Date(r.completedAt) >= startOfWeek)
  const avgPerformance = thisWeekReflections.length > 0
    ? thisWeekReflections.reduce((acc, r) => acc + r.performance, 0) / thisWeekReflections.length
    : 0

  return {
    workoutsCompleted,
    totalMinutes,
    totalSets,
    avgPerformance,
  }
}

