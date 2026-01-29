import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, getCurrentUser, getRecentReflections } from '@/db'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import type { WorkoutReflection } from '@/lib/types'

export function History() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())

  const recentWorkouts = useLiveQuery(
    async () => {
      if (!user) return []
      // Get completed workouts from last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      return db.workouts
        .where('status')
        .equals('completed')
        .filter((w) => new Date(w.completedAt!) >= thirtyDaysAgo)
        .reverse()
        .limit(20)
        .toArray()
    },
    [user]
  )

  const reflections = useLiveQuery(
    async () => {
      if (!recentWorkouts || recentWorkouts.length === 0) return []
      const workoutIds = recentWorkouts.map((w) => w.id)
      return db.workoutReflections.where('workoutId').anyOf(workoutIds).toArray()
    },
    [recentWorkouts]
  )

  const recentReflections = useLiveQuery(
    async () => {
      if (!user) return []
      return getRecentReflections(user.id, 14)
    },
    [user]
  )

  if (!user) return null

  // Calculate averages
  const avgEnergy =
    recentReflections && recentReflections.length > 0
      ? recentReflections.reduce((sum, r) => sum + r.energy, 0) / recentReflections.length
      : 0
  const avgPerformance =
    recentReflections && recentReflections.length > 0
      ? recentReflections.reduce((sum, r) => sum + r.performance, 0) / recentReflections.length
      : 0
  const avgSleep =
    recentReflections && recentReflections.length > 0
      ? recentReflections.reduce((sum, r) => sum + r.sleepHours, 0) / recentReflections.length
      : 0

  // Create lookup for reflections
  const reflectionsByWorkout = new Map<string, WorkoutReflection>()
  reflections?.forEach((r) => reflectionsByWorkout.set(r.workoutId, r))

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-muted-foreground">Your training log and trends</p>
      </header>

      {/* Trend Summary */}
      {recentReflections && recentReflections.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Last 2 Weeks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono">{avgEnergy.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Avg Energy</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono">{avgPerformance.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Avg Performance</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono">
                  {avgSleep.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">h</span>
                </p>
                <p className="text-xs text-muted-foreground">Avg Sleep</p>
              </div>
            </div>

            {/* Mini trend chart placeholder */}
            <div className="mt-4 flex items-end justify-between gap-1 h-16">
              {recentReflections.slice(0, 14).reverse().map((r) => (
                <div
                  key={r.id}
                  className="flex-1 bg-primary/80 rounded-t transition-all hover:bg-primary"
                  style={{ height: `${(r.performance / 10) * 100}%` }}
                  title={`${formatDate(r.completedAt)}: ${r.performance}/10`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Performance over last {Math.min(recentReflections.length, 14)} sessions
            </p>
          </CardContent>
        </Card>
      )}

      {/* Workout History */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Recent Workouts</h2>

        {recentWorkouts && recentWorkouts.length > 0 ? (
          recentWorkouts.map((workout) => {
            const reflection = reflectionsByWorkout.get(workout.id)
            return (
              <Card
                key={workout.id}
                className="cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={() => navigate(`/workout/${workout.id}`)}
              >
                <CardContent className="py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-medium">{workout.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(workout.completedAt!, 'long')}
                      </p>
                    </div>
                    <Badge variant="success">Complete</Badge>
                  </div>

                  {reflection && (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Energy: <span className="text-foreground">{reflection.energy}/10</span>
                      </span>
                      <span className="text-muted-foreground">
                        Performance:{' '}
                        <span className="text-foreground">{reflection.performance}/10</span>
                      </span>
                      {reflection.winOfTheDay && (
                        <span className="text-success text-xs truncate max-w-[150px]">
                          "{reflection.winOfTheDay}"
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">No completed workouts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your training history will appear here
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
