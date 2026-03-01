import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, getCurrentUser, getNextAvailableWorkout, getMissedWorkouts, skipWorkout, getActivePhase, getRecentReflections, getUserAchievements, getTodaysCheckIn, getRecentCheckIns } from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Progress } from '@/components/ui'
import { formatDate, formatDuration, cn, getShortDayName } from '@/lib/utils'
import { PHASE_CONFIG, ACHIEVEMENTS } from '@/lib/constants'
import type { WorkoutReflection, Workout, DailyCheckIn } from '@/lib/types'

export function Dashboard() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())
  const nextWorkout = useLiveQuery(
    async () => {
      if (!user) return null
      return getNextAvailableWorkout(user.id)
    },
    [user]
  )

  const missedWorkouts = useLiveQuery(
    async () => {
      if (!user) return []
      return getMissedWorkouts(user.id)
    },
    [user]
  )
  const activePhase = useLiveQuery(
    async () => {
      if (!user) return null
      return getActivePhase(user.id)
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
  const achievements = useLiveQuery(
    async () => {
      if (!user) return []
      return getUserAchievements(user.id)
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

  const thisWeekWorkouts = useLiveQuery(
    async () => {
      if (!user) return []
      const today = new Date()
      const dayOfWeek = today.getDay()
      const startOfWeek = new Date(today)
      startOfWeek.setDate(today.getDate() - dayOfWeek)
      startOfWeek.setHours(0, 0, 0, 0)
      return db.workouts
        .where('status')
        .equals('completed')
        .filter((w) => Boolean(w.completedAt && new Date(w.completedAt) >= startOfWeek))
        .toArray()
    },
    [user]
  )

  const todaysCheckIn = useLiveQuery(
    async () => {
      if (!user) return null
      return getTodaysCheckIn(user.id)
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

  if (!user) return null

  const greeting = getGreeting()
  const firstName = user.name.split(' ')[0]
  const weeklyStats = calculateWeeklyStats(thisWeekWorkouts || [], recentReflections || [])
  const insight = getPersonalizedInsight(user, weeklyStats, recentReflections || [])
  const currentStreak = user.currentStreak ?? 0

  return (
    <div className="flex flex-col">
      {/* Gradient Header */}
      <div className="gradient-header px-4 pt-12 pb-8 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-[#7209B7]/10 blur-2xl pointer-events-none" />

        <p className="text-sm text-muted-foreground relative z-10">{greeting}</p>
        <h1 className="text-3xl font-black text-foreground mt-0.5 relative z-10">{firstName}</h1>

        {/* Streak pill in header */}
        {currentStreak > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30 relative z-10">
            {currentStreak >= 3 && <span className="text-base animate-pulse">🔥</span>}
            <span className="text-sm font-bold text-primary">{currentStreak} day streak</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5 px-4 pb-8 -mt-1">
        {/* Weekly Calendar */}
        <WeeklyCalendar
          workouts={recentWorkouts || []}
          checkIns={recentCheckIns || []}
          missedWorkouts={missedWorkouts || []}
        />

        {/* Next Workout Hero Card */}
        <NextWorkoutCard
          nextWorkout={nextWorkout}
          onStart={(id) => navigate(`/workout/${id}`)}
          onQuickLog={() => navigate('/quick-log')}
          onProgram={() => navigate('/program')}
        />

        {/* Weekly Stats Row */}
        <WeeklyStatsRow stats={weeklyStats} insight={insight} />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <QuickActionCard
            icon={<BarbellIcon />}
            title="Quick Log"
            subtitle="Free workout"
            accent="primary"
            onClick={() => navigate('/quick-log')}
          />
          <QuickActionCard
            icon={<ChartLineIcon />}
            title="History"
            subtitle="View progress"
            accent="green"
            onClick={() => navigate('/history')}
          />
        </div>

        {/* Daily Check-In */}
        <DailyCheckInCard
          checkIn={todaysCheckIn}
          onCheckIn={() => navigate('/check-in')}
        />

        {/* Missed Workouts Alert */}
        {missedWorkouts && missedWorkouts.length > 0 && (
          <MissedWorkoutsCard
            workouts={missedWorkouts}
            onSkip={async (workoutId) => {
              await skipWorkout(workoutId, 'Skipped from dashboard')
            }}
            onCatchUp={(workoutId) => navigate(`/workout/${workoutId}`)}
          />
        )}

        {/* Active Phase */}
        {activePhase && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Current Phase</CardTitle>
                <Badge variant="outline">
                  {PHASE_CONFIG[activePhase.type]?.label || activePhase.type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                {PHASE_CONFIG[activePhase.type]?.description}
              </p>
              <PhaseProgress phase={activePhase} />
            </CardContent>
          </Card>
        )}

        {/* Recent Trends */}
        {recentReflections && recentReflections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <StatBox label="Energy" value={calculateAverage(recentReflections, 'energy')} trend={getTrend(recentReflections, 'energy')} />
                <StatBox label="Sleep" value={calculateAverage(recentReflections, 'sleepHours')} unit="h" trend={getTrend(recentReflections, 'sleepHours')} />
                <StatBox label="Perf" value={calculateAverage(recentReflections, 'performance')} trend={getTrend(recentReflections, 'performance')} />
              </div>
              {/* Mini bar chart */}
              <div className="flex items-end justify-between gap-1 h-10">
                {recentReflections.slice(0, 7).reverse().map((r) => (
                  <div
                    key={r.id}
                    className="flex-1 rounded-t-sm bg-primary/40 hover:bg-primary transition-colors"
                    style={{ height: `${(r.performance / 10) * 100}%` }}
                    title={`${formatDate(r.completedAt)}: ${r.performance}/10`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Performance over last {recentReflections.length} sessions
              </p>
            </CardContent>
          </Card>
        )}

        {/* Achievements */}
        {achievements && achievements.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Achievements</CardTitle>
                <Badge variant="outline">{achievements.length} unlocked</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {achievements
                  .sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime())
                  .slice(0, 6)
                  .map((ua) => {
                    const achievement = ACHIEVEMENTS[ua.achievementId]
                    if (!achievement) return null
                    return (
                      <div
                        key={ua.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary border border-border/30"
                        title={achievement.description}
                      >
                        <span className="text-lg">{achievement.icon}</span>
                        <span className="text-xs font-medium">{achievement.name}</span>
                      </div>
                    )
                  })}
              </div>
              {achievements.length > 6 && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  +{achievements.length - 6} more achievements
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* No Program State */}
        {!activePhase && (
          <Card className="border-dashed border-2 border-border/50">
            <CardContent className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">📋</span>
              </div>
              <h3 className="font-bold mb-1">No Active Program</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create a training program for structured workouts, or use Quick Log for free workouts.
              </p>
              <Button onClick={() => navigate('/program')}>
                Create Program
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NextWorkoutCard({
  nextWorkout,
  onStart,
  onQuickLog,
  onProgram,
}: {
  nextWorkout: Workout | null | undefined
  onStart: (id: string) => void
  onQuickLog: () => void
  onProgram: () => void
}) {
  if (nextWorkout?.status === 'completed') {
    return (
      <Card className="overflow-hidden">
        <CardContent className="pt-6 pb-6 text-center">
          <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-bold text-foreground">Workout Complete!</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Nice work today. Keep the momentum going.</p>
          <Button variant="outline" onClick={onQuickLog}>Log Another</Button>
        </CardContent>
      </Card>
    )
  }

  if (nextWorkout) {
    const isToday = isWorkoutToday(nextWorkout.scheduledDate)
    const isInProgress = nextWorkout.status === 'in_progress'

    return (
      <div className="rounded-2xl overflow-hidden relative">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1A1A2E] via-[#1e1e38] to-[#1A1A2E]" />
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent" />
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative z-10 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-widest">
                {isInProgress ? 'In Progress' : isToday ? "Today's Workout" : formatDate(nextWorkout.scheduledDate, 'long')}
              </p>
              <h2 className="text-xl font-black text-foreground mt-1">{nextWorkout.name}</h2>
            </div>
            {nextWorkout.totalDuration ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs text-muted-foreground">{formatDuration(nextWorkout.totalDuration)}</span>
              </div>
            ) : null}
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={() => onStart(nextWorkout.id)}
          >
            {isInProgress ? 'Continue Workout' : 'Start Workout'}
          </Button>
        </div>
      </div>
    )
  }

  // No scheduled workout
  return (
    <div className="rounded-2xl overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1A1A2E] to-[#1e1e38]" />
      <div className="absolute inset-0 bg-gradient-to-tr from-[#7209B7]/10 to-transparent" />

      <div className="relative z-10 p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Free Day</p>
        <h2 className="text-xl font-black text-foreground mb-1">No Scheduled Workout</h2>
        <p className="text-sm text-muted-foreground mb-4">Log a free workout or take a recovery day.</p>
        <div className="flex gap-3">
          <Button className="flex-1" onClick={onQuickLog}>Start Workout</Button>
          <Button variant="outline" className="flex-1" onClick={onProgram}>View Program</Button>
        </div>
      </div>
    </div>
  )
}

function WeeklyCalendar({
  workouts,
  checkIns,
  missedWorkouts,
}: {
  workouts: Workout[]
  checkIns: DailyCheckIn[]
  missedWorkouts: Workout[]
}) {
  const today = new Date()
  const dayOfWeek = today.getDay()

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() - dayOfWeek + i)
    return date
  })

  const workoutDates = new Map<string, Workout[]>()
  workouts.forEach(w => {
    if (w.completedAt) {
      const dateKey = new Date(w.completedAt).toDateString()
      workoutDates.set(dateKey, [...(workoutDates.get(dateKey) || []), w])
    }
  })

  const missedDates = new Set(missedWorkouts.map(w => new Date(w.scheduledDate).toDateString()))
  const checkInDates = new Set(checkIns.map(c => new Date(c.date).toDateString()))

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">This Week</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-7 gap-1">
          {weekDates.map((date, i) => {
            const dateKey = date.toDateString()
            const hasWorkout = (workoutDates.get(dateKey) || []).length > 0
            const hasCheckIn = checkInDates.has(dateKey)
            const hasMissed = missedDates.has(dateKey)
            const isToday = date.toDateString() === today.toDateString()
            const isPast = date < today && !isToday

            return (
              <div
                key={i}
                className={cn(
                  'flex flex-col items-center py-2.5 rounded-xl transition-all',
                  isToday && 'bg-primary/15 ring-1 ring-primary/40',
                  hasWorkout && !isToday && 'bg-success/8',
                  hasMissed && !hasWorkout && !isToday && 'bg-warning/5',
                  !hasWorkout && !hasCheckIn && !hasMissed && isPast && 'opacity-40'
                )}
              >
                <span className={cn(
                  'text-[10px] font-semibold uppercase tracking-wide',
                  isToday ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {getShortDayName(date.getDay())}
                </span>
                <span className={cn(
                  'text-base font-bold mt-0.5 leading-none',
                  isToday && 'text-primary',
                  hasMissed && !hasWorkout && !isToday && 'text-warning',
                  !isToday && !hasMissed && 'text-foreground'
                )}>
                  {date.getDate()}
                </span>
                <div className="h-3 mt-1 flex items-center gap-0.5">
                  {hasWorkout && <div className="w-1.5 h-1.5 rounded-full bg-success" />}
                  {hasMissed && !hasWorkout && <div className="w-1.5 h-1.5 rounded-full bg-warning" />}
                  {hasCheckIn && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  {!hasWorkout && !hasCheckIn && !hasMissed && (
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      isToday ? 'border border-primary/50' : 'border border-muted-foreground/20'
                    )} />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-success inline-block" /> Done</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning inline-block" /> Missed</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> Check-in</span>
        </div>
      </CardContent>
    </Card>
  )
}

function WeeklyStatsRow({
  stats,
  insight,
}: {
  stats: { workoutsCompleted: number; totalMinutes: number; totalSets: number; avgPerformance: number }
  insight: string
}) {
  const statItems = [
    { label: 'Workouts', value: stats.workoutsCompleted, color: 'text-primary' },
    { label: 'Minutes', value: stats.totalMinutes, color: 'text-foreground' },
    { label: 'Sets', value: stats.totalSets, color: 'text-foreground' },
    { label: 'Avg Perf', value: stats.avgPerformance > 0 ? stats.avgPerformance.toFixed(1) : '–', color: 'text-[#00F5D4]' },
  ]

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="grid grid-cols-4 gap-2 mb-4">
          {statItems.map((item) => (
            <div key={item.label} className="text-center">
              <p className={cn('text-xl font-black font-mono', item.color)}>{item.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2.5 pt-3 border-t border-border/30">
          <span className="text-base shrink-0">💡</span>
          <p className="text-xs text-muted-foreground leading-relaxed">{insight}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function QuickActionCard({
  icon,
  title,
  subtitle,
  accent,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  accent: 'primary' | 'green'
  onClick: () => void
}) {
  const accentClasses = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-[#00F5D4]/10 text-[#00F5D4]',
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl p-4 border border-border/30 bg-card',
        'hover:border-primary/30 active:scale-[0.97]',
        'transition-all duration-200 press-feedback'
      )}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', accentClasses[accent])}>
        {icon}
      </div>
      <p className="font-semibold text-sm text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </button>
  )
}

function DailyCheckInCard({
  checkIn,
  onCheckIn,
}: {
  checkIn: DailyCheckIn | null | undefined
  onCheckIn: () => void
}) {
  if (checkIn) {
    const getMoodEmoji = (mood: number) => {
      if (mood <= 2) return '😔'
      if (mood <= 4) return '😕'
      if (mood <= 6) return '😐'
      if (mood <= 8) return '🙂'
      return '😄'
    }

    return (
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{getMoodEmoji(checkIn.mood)}</span>
              <div>
                <p className="text-sm font-semibold">Today's Check-In</p>
                <p className="text-xs text-muted-foreground">
                  Energy {checkIn.energy}/10 · Sleep {checkIn.sleepHours}h · Mood {checkIn.mood}/10
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onCheckIn}>Update</Button>
          </div>
          {checkIn.highlight && (
            <div className="mt-3 pt-3 border-t border-primary/10">
              <p className="text-xs text-muted-foreground">
                Highlight: <span className="text-foreground">{checkIn.highlight}</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <button
      onClick={onCheckIn}
      className="w-full text-left rounded-2xl border-2 border-dashed border-primary/25 p-4 hover:border-primary/40 active:scale-[0.98] transition-all duration-200"
    >
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-xl">✨</span>
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-foreground">Daily Check-In</p>
          <p className="text-xs text-muted-foreground mt-0.5">How are you feeling today?</p>
        </div>
        <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
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
  const [expanded, setExpanded] = useState(false)
  const displayWorkouts = expanded ? workouts : workouts.slice(0, 2)

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <CardTitle className="text-sm text-warning">
              {workouts.length} Missed Workout{workouts.length > 1 ? 's' : ''}
            </CardTitle>
          </div>
          {workouts.length > 2 && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-xs">
              {expanded ? 'Less' : `All (${workouts.length})`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {displayWorkouts.map((workout) => (
            <div
              key={workout.id}
              className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/30"
            >
              <div>
                <p className="font-medium text-sm">{workout.name}</p>
                <p className="text-xs text-muted-foreground">{formatDate(workout.scheduledDate, 'short')}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => onSkip(workout.id)}>Skip</Button>
                <Button size="sm" onClick={() => onCatchUp(workout.id)}>Catch Up</Button>
              </div>
            </div>
          ))}
        </div>
        {workouts.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 text-muted-foreground text-xs"
            onClick={() => workouts.forEach(w => onSkip(w.id))}
          >
            Skip All Missed Workouts
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function PhaseProgress({ phase }: { phase: { startDate: Date; endDate: Date; weekCount: number } }) {
  const start = new Date(phase.startDate)
  const end = new Date(phase.endDate)
  const today = new Date()
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const daysElapsed = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const progress = Math.min(Math.max((daysElapsed / totalDays) * 100, 0), 100)
  const currentWeek = Math.min(Math.ceil(daysElapsed / 7), phase.weekCount)

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Week {currentWeek} of {phase.weekCount}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <Progress value={progress} />
    </div>
  )
}

function StatBox({
  label,
  value,
  unit,
  trend,
}: {
  label: string
  value: number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1">
        <span className="text-xl font-black font-mono text-foreground">
          {value.toFixed(1)}{unit && <span className="text-sm font-normal text-muted-foreground ml-0.5">{unit}</span>}
        </span>
        {trend && (
          <span className={cn(
            'text-xs font-bold',
            trend === 'up' && 'text-success',
            trend === 'down' && 'text-destructive',
            trend === 'stable' && 'text-muted-foreground'
          )}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

// ─── Icon components ──────────────────────────────────────────────────────────

function BarbellIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6.5h11M6.5 17.5h11M4 9v6M8 7v10M16 7v10M20 9v6" />
    </svg>
  )
}

function ChartLineIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-6 4 5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
    </svg>
  )
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning,'
  if (hour < 17) return 'Good afternoon,'
  return 'Good evening,'
}

function isWorkoutToday(scheduledDate: Date): boolean {
  const today = new Date()
  const scheduled = new Date(scheduledDate)
  return (
    today.getDate() === scheduled.getDate() &&
    today.getMonth() === scheduled.getMonth() &&
    today.getFullYear() === scheduled.getFullYear()
  )
}

function calculateAverage(reflections: WorkoutReflection[], key: keyof WorkoutReflection): number {
  if (reflections.length === 0) return 0
  const sum = reflections.reduce((acc, r) => {
    const value = r[key]
    return acc + (typeof value === 'number' ? value : 0)
  }, 0)
  return sum / reflections.length
}

function getTrend(reflections: WorkoutReflection[], key: keyof WorkoutReflection): 'up' | 'down' | 'stable' {
  if (reflections.length < 2) return 'stable'
  const midpoint = Math.floor(reflections.length / 2)
  const recentAvg = calculateAverage(reflections.slice(0, midpoint), key)
  const olderAvg = calculateAverage(reflections.slice(midpoint), key)
  const diff = recentAvg - olderAvg
  if (Math.abs(diff) < 0.5) return 'stable'
  return diff > 0 ? 'up' : 'down'
}

function calculateWeeklyStats(
  workouts: Workout[],
  reflections: WorkoutReflection[]
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
    totalSets: workoutsCompleted * 15,
    avgPerformance,
  }
}

function getPersonalizedInsight(
  user: { currentStreak: number; totalWorkoutsCompleted: number; name: string },
  weeklyStats: { workoutsCompleted: number; avgPerformance: number },
  reflections: WorkoutReflection[]
): string {
  const insights: string[] = []

  if (user.currentStreak === 0) {
    insights.push("Start your streak today! Every journey begins with a single workout.")
  } else if (user.currentStreak >= 7) {
    insights.push(`${user.currentStreak} days strong. You're building unstoppable momentum.`)
  } else if (user.currentStreak >= 3) {
    insights.push(`${user.currentStreak} day streak! You're building a powerful habit.`)
  }

  if (weeklyStats.workoutsCompleted === 0) {
    insights.push("New week, new opportunity. Let's make it count!")
  } else if (weeklyStats.workoutsCompleted >= 4) {
    insights.push("Crushing it this week! Your consistency is paying off.")
  } else if (weeklyStats.workoutsCompleted >= 2) {
    insights.push("Good momentum this week. Keep pushing forward!")
  }

  if (reflections.length > 0) {
    const avgSleep = calculateAverage(reflections, 'sleepHours')
    const avgEnergy = calculateAverage(reflections, 'energy')
    const recentPerf = reflections[0]?.performance || 0

    if (avgSleep < 6.5) {
      insights.push("Sleep has been low. Prioritizing rest can boost your gains significantly.")
    } else if (avgEnergy < 5) {
      insights.push("Energy is running low. Consider a lighter session or focus on recovery.")
    } else if (recentPerf >= 8) {
      insights.push("You're performing at a high level. Keep riding this wave.")
    }
  }

  if (user.totalWorkoutsCompleted === 0) {
    insights.push("Your first workout awaits! Let's build something great together.")
  } else if (user.totalWorkoutsCompleted % 10 === 0 && user.totalWorkoutsCompleted > 0) {
    insights.push(`${user.totalWorkoutsCompleted} workouts completed. That's real dedication.`)
  }

  if (insights.length === 0) return "Stay consistent, trust the process, and the results will follow."
  return insights[Math.floor(Math.random() * insights.length)]
}
