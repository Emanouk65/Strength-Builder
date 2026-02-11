import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, getCurrentUser, getNextAvailableWorkout, getMissedWorkouts, skipWorkout, getActivePhase, getRecentReflections, getUserAchievements, getTodaysCheckIn, getRecentCheckIns } from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Progress } from '@/components/ui'
import { formatDate, formatDuration, cn, getShortDayName } from '@/lib/utils'
import { PHASE_CONFIG, ACHIEVEMENTS, getStreakMessage } from '@/lib/constants'
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

  // Get workouts from the last 30 days for calendar
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

  // Get this week's workouts for weekly summary
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

  // Get today's check-in
  const todaysCheckIn = useLiveQuery(
    async () => {
      if (!user) return null
      return getTodaysCheckIn(user.id)
    },
    [user]
  )

  // Get recent check-ins for insights
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

  // Calculate weekly stats
  const weeklyStats = calculateWeeklyStats(thisWeekWorkouts || [], recentReflections || [])

  // Get motivational insight based on user's data
  const insight = getPersonalizedInsight(user, weeklyStats, recentReflections || [])

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      {/* Header with greeting */}
      <header className="pt-2">
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h1 className="text-2xl font-bold text-foreground">{firstName}</h1>
      </header>

      {/* Weekly Calendar */}
      <WeeklyCalendar
        workouts={recentWorkouts || []}
        checkIns={recentCheckIns || []}
        missedWorkouts={missedWorkouts || []}
        onDayClick={() => {
          // Could navigate to that day's workout or history
        }}
      />

      {/* Daily Check-In Card */}
      <DailyCheckInCard
        checkIn={todaysCheckIn}
        onCheckIn={() => navigate('/check-in')}
      />

      {/* This Week Summary */}
      <WeeklySummaryCard
        stats={weeklyStats}
        insight={insight}
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/quick-log')}
        >
          <CardContent className="pt-4 pb-4 text-center">
            <span className="text-3xl mb-2 block">🏋️</span>
            <p className="font-medium text-sm">Quick Log</p>
            <p className="text-xs text-muted-foreground">Free workout</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/history')}
        >
          <CardContent className="pt-4 pb-4 text-center">
            <span className="text-3xl mb-2 block">📊</span>
            <p className="font-medium text-sm">History</p>
            <p className="text-xs text-muted-foreground">View progress</p>
          </CardContent>
        </Card>
      </div>

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

      {/* Next Workout or Start CTA */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {nextWorkout ? (
                  isWorkoutToday(nextWorkout.scheduledDate) ? 'Today' : formatDate(nextWorkout.scheduledDate, 'long')
                ) : formatDate(new Date(), 'long')}
              </p>
              <CardTitle className="mt-1">
                {nextWorkout ? nextWorkout.name : "Today's Training"}
              </CardTitle>
            </div>
            {nextWorkout && (
              <Badge variant={nextWorkout.status === 'completed' ? 'success' : 'default'}>
                {nextWorkout.status === 'completed' ? 'Complete' : formatDuration(nextWorkout.totalDuration)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {nextWorkout ? (
            <>
              {nextWorkout.status === 'completed' ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-2">✓</div>
                  <p className="text-muted-foreground">Workout complete. Nice work!</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => navigate('/quick-log')}
                  >
                    Log Another Workout
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    {getWorkoutPreview(nextWorkout)}
                  </p>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => navigate(`/workout/${nextWorkout.id}`)}
                  >
                    {nextWorkout.status === 'in_progress' ? 'Continue Workout' : 'Start Workout'}
                  </Button>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-muted-foreground mb-4">
                No scheduled workout. Log a free workout or take a recovery day.
              </p>
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={() => navigate('/quick-log')}
                >
                  Start Workout
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate('/program')}
                >
                  View Program
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Streak & Stats Card */}
      <StreakCard
        currentStreak={user.currentStreak ?? 0}
        longestStreak={user.longestStreak ?? 0}
        totalWorkouts={user.totalWorkoutsCompleted ?? 0}
      />

      {/* Active Phase Card */}
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

      {/* Recent Trends - Enhanced */}
      {recentReflections && recentReflections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <StatBox
                label="Energy"
                value={calculateAverage(recentReflections, 'energy')}
                trend={getTrend(recentReflections, 'energy')}
              />
              <StatBox
                label="Sleep"
                value={calculateAverage(recentReflections, 'sleepHours')}
                unit="hrs"
                trend={getTrend(recentReflections, 'sleepHours')}
              />
              <StatBox
                label="Performance"
                value={calculateAverage(recentReflections, 'performance')}
                trend={getTrend(recentReflections, 'performance')}
              />
            </div>
            {/* Mini performance chart */}
            <div className="flex items-end justify-between gap-1 h-12 mt-2">
              {recentReflections.slice(0, 7).reverse().map((r) => (
                <div
                  key={r.id}
                  className="flex-1 bg-primary/60 rounded-t transition-all hover:bg-primary"
                  style={{ height: `${(r.performance / 10) * 100}%` }}
                  title={`${formatDate(r.completedAt)}: ${r.performance}/10`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Performance over last {recentReflections.length} sessions
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recent Achievements */}
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
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary"
                      title={achievement.description}
                    >
                      <span className="text-xl">{achievement.icon}</span>
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
        <Card className="border-dashed border-2">
          <CardContent className="py-8 text-center">
            <h3 className="font-semibold mb-2">No Active Program</h3>
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
  )
}

// Helper components

// Weekly Calendar Component
function WeeklyCalendar({
  workouts,
  checkIns,
  missedWorkouts,
  onDayClick,
}: {
  workouts: Workout[]
  checkIns: DailyCheckIn[]
  missedWorkouts: Workout[]
  onDayClick?: (date: Date) => void
}) {
  const today = new Date()
  const dayOfWeek = today.getDay()

  // Generate the current week's dates
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() - dayOfWeek + i)
    return date
  })

  // Create a map of completed workout dates
  const workoutDates = new Map<string, Workout[]>()
  workouts.forEach(w => {
    if (w.completedAt) {
      const dateKey = new Date(w.completedAt).toDateString()
      const existing = workoutDates.get(dateKey) || []
      workoutDates.set(dateKey, [...existing, w])
    }
  })

  // Create a set of missed workout dates
  const missedDates = new Set<string>()
  missedWorkouts.forEach(w => {
    const dateKey = new Date(w.scheduledDate).toDateString()
    missedDates.add(dateKey)
  })

  // Create a map of check-in dates
  const checkInDates = new Set<string>()
  checkIns.forEach(c => {
    checkInDates.add(new Date(c.date).toDateString())
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">This Week</CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-success" /> Done
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-warning" /> Missed
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-primary" /> Check-in
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {weekDates.map((date, i) => {
            const dateKey = date.toDateString()
            const dayWorkouts = workoutDates.get(dateKey) || []
            const hasCheckIn = checkInDates.has(dateKey)
            const hasMissed = missedDates.has(dateKey)
            const isToday = date.toDateString() === today.toDateString()
            const isPast = date < today && !isToday
            const hasWorkout = dayWorkouts.length > 0
            const hasActivity = hasWorkout || hasCheckIn

            return (
              <div
                key={i}
                className={cn(
                  'flex flex-col items-center py-2 rounded-lg transition-colors cursor-pointer',
                  isToday && 'bg-primary/10 border border-primary/30',
                  hasActivity && !isToday && 'bg-success/5',
                  hasMissed && !hasWorkout && 'bg-warning/5',
                  !hasActivity && !hasMissed && isPast && 'opacity-50'
                )}
                onClick={() => onDayClick?.(date)}
              >
                <span className={cn(
                  'text-xs font-medium',
                  isToday ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {getShortDayName(date.getDay())}
                </span>
                <span className={cn(
                  'text-lg font-bold mt-1',
                  isToday && 'text-primary',
                  hasMissed && !hasWorkout && 'text-warning'
                )}>
                  {date.getDate()}
                </span>
                {/* Activity indicators */}
                <div className="h-4 mt-1 flex items-center justify-center gap-0.5">
                  {hasWorkout && (
                    <div className="w-2 h-2 rounded-full bg-success" />
                  )}
                  {hasMissed && !hasWorkout && (
                    <div className="w-2 h-2 rounded-full bg-warning" />
                  )}
                  {hasCheckIn && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                  {!hasActivity && !hasMissed && isPast && (
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                  )}
                  {!hasActivity && !hasMissed && !isPast && (
                    <div className="w-2 h-2 rounded-full border border-muted-foreground/30" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// Daily Check-In Card Component
function DailyCheckInCard({
  checkIn,
  onCheckIn,
}: {
  checkIn: DailyCheckIn | null | undefined
  onCheckIn: () => void
}) {
  if (checkIn) {
    // Already checked in today - show summary
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
                <p className="text-sm font-medium">Today's Check-In</p>
                <p className="text-xs text-muted-foreground">
                  Energy {checkIn.energy}/10 · Sleep {checkIn.sleepHours}h · Mood {checkIn.mood}/10
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onCheckIn}>
              Update
            </Button>
          </div>
          {checkIn.highlight && (
            <div className="mt-3 pt-3 border-t border-primary/10">
              <p className="text-xs text-muted-foreground">Highlight: <span className="text-foreground">{checkIn.highlight}</span></p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // No check-in yet - prompt to check in
  return (
    <Card
      className="border-dashed border-2 border-primary/30 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onCheckIn}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">✨</span>
          </div>
          <div className="flex-1">
            <p className="font-medium">Daily Check-In</p>
            <p className="text-sm text-muted-foreground">
              How are you feeling today? Track your wellness.
            </p>
          </div>
          <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </CardContent>
    </Card>
  )
}

// Weekly Summary Card
function WeeklySummaryCard({
  stats,
  insight,
}: {
  stats: {
    workoutsCompleted: number
    totalMinutes: number
    totalSets: number
    avgPerformance: number
  }
  insight: string
}) {
  return (
    <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
      <CardContent className="pt-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="text-center">
            <p className="text-2xl font-black text-primary">{stats.workoutsCompleted}</p>
            <p className="text-xs text-muted-foreground">Workouts</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-foreground">{stats.totalMinutes}</p>
            <p className="text-xs text-muted-foreground">Minutes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-foreground">{stats.totalSets}</p>
            <p className="text-xs text-muted-foreground">Sets</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-foreground">
              {stats.avgPerformance > 0 ? stats.avgPerformance.toFixed(1) : '-'}
            </p>
            <p className="text-xs text-muted-foreground">Avg Perf</p>
          </div>
        </div>

        {/* Personalized Insight */}
        <div className="flex items-start gap-3 pt-3 border-t border-primary/10">
          <span className="text-xl">💡</span>
          <p className="text-sm text-muted-foreground flex-1">{insight}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function StreakCard({
  currentStreak,
  longestStreak,
  totalWorkouts,
}: {
  currentStreak: number
  longestStreak: number
  totalWorkouts: number
}) {
  const streakMessage = getStreakMessage(currentStreak)
  const isOnFire = currentStreak >= 3

  return (
    <Card className={cn(
      isOnFire && 'border-primary/50 bg-gradient-to-br from-primary/5 to-transparent'
    )}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={cn(
                'text-5xl font-black font-mono',
                isOnFire ? 'text-primary' : 'text-foreground'
              )}>
                {currentStreak}
              </div>
              {isOnFire && (
                <span className="absolute -top-2 -right-4 text-2xl animate-pulse">🔥</span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Day Streak</p>
              <p className="text-xs text-muted-foreground">{streakMessage}</p>
            </div>
          </div>
          <div className="text-right space-y-1">
            <div>
              <span className="text-lg font-bold font-mono">{totalWorkouts}</span>
              <span className="text-xs text-muted-foreground ml-1">workouts</span>
            </div>
            <div>
              <span className="text-sm font-mono text-muted-foreground">{longestStreak}</span>
              <span className="text-xs text-muted-foreground ml-1">best</span>
            </div>
          </div>
        </div>
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
        <span>{Math.round(progress)}% complete</span>
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
  const displayValue = unit ? `${value.toFixed(1)}` : value.toFixed(1)

  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1">
        <p className="text-2xl font-bold font-mono text-foreground">
          {displayValue}
          {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </p>
        {trend && (
          <span className={cn(
            'text-xs',
            trend === 'up' && 'text-success',
            trend === 'down' && 'text-destructive',
            trend === 'stable' && 'text-muted-foreground'
          )}>
            {trend === 'up' && '↑'}
            {trend === 'down' && '↓'}
            {trend === 'stable' && '→'}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// Helper functions
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning,'
  if (hour < 17) return 'Good afternoon,'
  return 'Good evening,'
}

function getWorkoutPreview(_workout: { name: string }): string {
  // This would be expanded to show actual workout preview
  return 'Tap to view the training session and begin when ready.'
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

// Missed Workouts Card Component
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
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <CardTitle className="text-base text-warning">
              {workouts.length} Missed Workout{workouts.length > 1 ? 's' : ''}
            </CardTitle>
          </div>
          {workouts.length > 2 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-xs"
            >
              {expanded ? 'Show less' : `Show all (${workouts.length})`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Catch up on missed workouts or skip them to continue your program.
        </p>
        <div className="space-y-2">
          {displayWorkouts.map((workout) => (
            <div
              key={workout.id}
              className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
            >
              <div>
                <p className="font-medium text-sm">{workout.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(workout.scheduledDate, 'short')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSkip(workout.id)}
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={() => onCatchUp(workout.id)}
                >
                  Catch Up
                </Button>
              </div>
            </div>
          ))}
        </div>
        {workouts.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 text-muted-foreground"
            onClick={() => workouts.forEach(w => onSkip(w.id))}
          >
            Skip All Missed Workouts
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function calculateAverage(
  reflections: WorkoutReflection[],
  key: keyof WorkoutReflection
): number {
  if (reflections.length === 0) return 0
  const sum = reflections.reduce((acc, r) => {
    const value = r[key]
    return acc + (typeof value === 'number' ? value : 0)
  }, 0)
  return sum / reflections.length
}

// Calculate trend direction from reflections
function getTrend(
  reflections: WorkoutReflection[],
  key: keyof WorkoutReflection
): 'up' | 'down' | 'stable' {
  if (reflections.length < 2) return 'stable'

  // Compare average of recent half vs older half
  const midpoint = Math.floor(reflections.length / 2)
  const recent = reflections.slice(0, midpoint)
  const older = reflections.slice(midpoint)

  const recentAvg = calculateAverage(recent, key)
  const olderAvg = calculateAverage(older, key)

  const diff = recentAvg - olderAvg
  if (Math.abs(diff) < 0.5) return 'stable'
  return diff > 0 ? 'up' : 'down'
}

// Calculate weekly stats from workouts
function calculateWeeklyStats(
  workouts: Workout[],
  reflections: WorkoutReflection[]
): {
  workoutsCompleted: number
  totalMinutes: number
  totalSets: number
  avgPerformance: number
} {
  const workoutsCompleted = workouts.length
  const totalMinutes = workouts.reduce((acc, w) => acc + (w.totalDuration || 0), 0)

  // Get this week's reflections
  const today = new Date()
  const dayOfWeek = today.getDay()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - dayOfWeek)
  startOfWeek.setHours(0, 0, 0, 0)

  const thisWeekReflections = reflections.filter(r =>
    new Date(r.completedAt) >= startOfWeek
  )

  const avgPerformance = thisWeekReflections.length > 0
    ? thisWeekReflections.reduce((acc, r) => acc + r.performance, 0) / thisWeekReflections.length
    : 0

  // Estimate total sets (would need to query actual sets for accurate count)
  const totalSets = workoutsCompleted * 15 // Rough estimate

  return {
    workoutsCompleted,
    totalMinutes,
    totalSets,
    avgPerformance,
  }
}

// Get personalized insight based on user data
function getPersonalizedInsight(
  user: { currentStreak: number; totalWorkoutsCompleted: number; name: string },
  weeklyStats: { workoutsCompleted: number; avgPerformance: number },
  reflections: WorkoutReflection[]
): string {
  const insights: string[] = []

  // Streak-based insights
  if (user.currentStreak === 0) {
    insights.push("Start your streak today! Every journey begins with a single workout.")
  } else if (user.currentStreak >= 7) {
    insights.push(`Incredible! ${user.currentStreak} days strong. You're building unstoppable momentum.`)
  } else if (user.currentStreak >= 3) {
    insights.push(`${user.currentStreak} day streak! You're building a powerful habit.`)
  }

  // Weekly performance insights
  if (weeklyStats.workoutsCompleted === 0) {
    insights.push("New week, new opportunity. Let's make it count!")
  } else if (weeklyStats.workoutsCompleted >= 4) {
    insights.push("Crushing it this week! Your consistency is paying off.")
  } else if (weeklyStats.workoutsCompleted >= 2) {
    insights.push("Good momentum this week. Keep pushing forward!")
  }

  // Performance-based insights
  if (reflections.length > 0) {
    const recentPerf = reflections[0]?.performance || 0
    const avgEnergy = calculateAverage(reflections, 'energy')
    const avgSleep = calculateAverage(reflections, 'sleepHours')

    if (avgSleep < 6.5) {
      insights.push("Your sleep has been low. Prioritizing rest can boost your performance significantly.")
    } else if (avgEnergy < 5) {
      insights.push("Energy has been running low. Consider a lighter session or focus on recovery.")
    } else if (recentPerf >= 8) {
      insights.push("You're performing at a high level! Keep riding this wave.")
    }
  }

  // Milestone insights
  if (user.totalWorkoutsCompleted === 0) {
    insights.push("Your first workout awaits! Let's build something great together.")
  } else if (user.totalWorkoutsCompleted % 10 === 0 && user.totalWorkoutsCompleted > 0) {
    insights.push(`${user.totalWorkoutsCompleted} workouts completed! That's real dedication.`)
  }

  // Return a random insight if multiple, or a default
  if (insights.length === 0) {
    return "Stay consistent, trust the process, and the results will follow."
  }

  return insights[Math.floor(Math.random() * insights.length)]
}
