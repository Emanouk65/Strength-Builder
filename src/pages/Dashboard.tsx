import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, getTodaysWorkout, getActivePhase, getRecentReflections, getUserAchievements } from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Progress } from '@/components/ui'
import { formatDate, formatDuration } from '@/lib/utils'
import { PHASE_CONFIG, ACHIEVEMENTS, getStreakMessage } from '@/lib/constants'
import type { WorkoutReflection } from '@/lib/types'

export function Dashboard() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())
  const todaysWorkout = useLiveQuery(
    async () => {
      if (!user) return null
      return getTodaysWorkout(user.id)
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
      return getRecentReflections(user.id, 5)
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

  if (!user) return null

  const greeting = getGreeting()
  const firstName = user.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      {/* Header */}
      <header className="pt-2">
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h1 className="text-2xl font-bold text-foreground">{firstName}</h1>
      </header>

      {/* Streak Card */}
      <StreakCard
        currentStreak={user.currentStreak ?? 0}
        longestStreak={user.longestStreak ?? 0}
        totalWorkouts={user.totalWorkoutsCompleted ?? 0}
      />

      {/* Today's Workout Card */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {formatDate(new Date(), 'long')}
              </p>
              <CardTitle className="mt-1">
                {todaysWorkout ? todaysWorkout.name : 'Rest Day'}
              </CardTitle>
            </div>
            {todaysWorkout && (
              <Badge variant={todaysWorkout.status === 'completed' ? 'success' : 'default'}>
                {todaysWorkout.status === 'completed' ? 'Complete' : formatDuration(todaysWorkout.totalDuration)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {todaysWorkout ? (
            <>
              {todaysWorkout.status === 'completed' ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-2">&#10003;</div>
                  <p className="text-muted-foreground">Workout complete. Nice work.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    {getWorkoutPreview(todaysWorkout)}
                  </p>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => navigate(`/workout/${todaysWorkout.id}`)}
                  >
                    {todaysWorkout.status === 'in_progress' ? 'Continue Workout' : 'Start Workout'}
                  </Button>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground">
                Recovery day. Rest, stretch, and prepare for tomorrow.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Quick Stats */}
      {recentReflections && recentReflections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <StatBox
                label="Avg Energy"
                value={calculateAverage(recentReflections, 'energy')}
              />
              <StatBox
                label="Avg Sleep"
                value={calculateAverage(recentReflections, 'sleepHours')}
                unit="hrs"
              />
              <StatBox
                label="Performance"
                value={calculateAverage(recentReflections, 'performance')}
              />
            </div>
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
              Generate your first training phase to get started.
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
    <Card className={isOnFire ? 'border-primary/50 bg-gradient-to-br from-primary/5 to-transparent' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`text-5xl font-black font-mono ${isOnFire ? 'text-primary' : 'text-foreground'}`}>
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

function StatBox({ label, value, unit }: { label: string; value: number; unit?: string }) {
  const displayValue = unit ? `${value.toFixed(1)}` : value.toFixed(1)

  return (
    <div className="text-center">
      <p className="text-2xl font-bold font-mono text-foreground">
        {displayValue}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
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
  return 'Tap to view today\'s training session and begin when ready.'
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
