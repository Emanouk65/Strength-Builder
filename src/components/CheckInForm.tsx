import { useState, useEffect, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  getTodaysCheckIn,
  saveDailyCheckIn,
  getReflectionForWorkout,
} from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Slider } from '@/components/ui'
import { cn, generateId, getLocalDateString } from '@/lib/utils'
import type { DailyCheckIn, WorkoutReflection } from '@/lib/types'

/**
 * The single full check-in form used everywhere: the /check-in page and the
 * post-workout journal. All 9 wellness sliders + daily reflection texts, plus
 * (in post-workout mode) a session section. Submitting always upserts today's
 * DailyCheckIn — a post-workout entry counts as the day's check-in, no double
 * entry — and, when workoutId is set, upserts the linked WorkoutReflection
 * with the REAL slider values (no more hardcoded sleep/stress defaults).
 */
export function CheckInForm({
  userId,
  workoutId = null,
  submitLabel,
  onSubmitted,
  renderActions,
}: {
  userId: string
  /** Post-workout mode: collect session rating/win/challenge and write a WorkoutReflection. */
  workoutId?: string | null
  submitLabel?: string
  /** Called after all writes land. Receives key values for follow-up logic (streaks, achievements). */
  onSubmitted: (vals: { energy: number; overall: number }) => void | Promise<void>
  /** Optional custom action bar (e.g. the workout screen's sticky Skip / Save bar). */
  renderActions?: (opts: { submit: () => void; isSaving: boolean }) => ReactNode
}) {
  const isPostWorkout = workoutId != null

  const existingCheckIn = useLiveQuery(() => getTodaysCheckIn(userId), [userId])

  const [checkIn, setCheckIn] = useState({
    energy: 7,
    mood: 7,
    sleepQuality: 7,
    sleepHours: 7,
    hydration: 7,
    nutrition: 7,
    stress: 5,
    motivation: 7,
    soreness: 3,
    highlight: '',
    challenge: '',
    gratitude: '',
    notes: '',
  })
  // Session extras (post-workout mode only)
  const [overall, setOverall] = useState(7)
  const [win, setWin] = useState('')
  const [struggle, setStruggle] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Prefill from today's check-in — the form is an idempotent upsert.
  useEffect(() => {
    if (existingCheckIn) {
      setCheckIn({
        energy: existingCheckIn.energy,
        mood: existingCheckIn.mood,
        sleepQuality: existingCheckIn.sleepQuality,
        sleepHours: existingCheckIn.sleepHours,
        hydration: existingCheckIn.hydration,
        nutrition: existingCheckIn.nutrition,
        stress: existingCheckIn.stress,
        motivation: existingCheckIn.motivation,
        soreness: existingCheckIn.soreness,
        highlight: existingCheckIn.highlight,
        challenge: existingCheckIn.challenge,
        gratitude: existingCheckIn.gratitude,
        notes: existingCheckIn.notes,
      })
    }
  }, [existingCheckIn])

  const handleSubmit = async () => {
    setIsSaving(true)
    try {
      const today = getLocalDateString()

      const checkInData: DailyCheckIn = {
        id: existingCheckIn?.id || generateId(),
        userId,
        date: today,
        completedAt: new Date(),
        energy: checkIn.energy,
        mood: checkIn.mood,
        sleepQuality: checkIn.sleepQuality,
        sleepHours: checkIn.sleepHours,
        hydration: checkIn.hydration,
        nutrition: checkIn.nutrition,
        stress: checkIn.stress,
        motivation: checkIn.motivation,
        soreness: checkIn.soreness,
        highlight: checkIn.highlight,
        // In post-workout mode the session challenge doubles as the daily one
        // (unless the user already wrote a daily challenge earlier today).
        challenge: checkIn.challenge || (isPostWorkout ? struggle : ''),
        gratitude: checkIn.gratitude,
        notes: checkIn.notes,
        workoutId: workoutId ?? existingCheckIn?.workoutId ?? null,
      }
      await saveDailyCheckIn(checkInData)

      if (isPostWorkout && workoutId) {
        const existingReflection = await getReflectionForWorkout(workoutId)
        const reflection: WorkoutReflection = {
          id: existingReflection?.id ?? generateId(),
          workoutId,
          completedAt: new Date(),
          energy: checkIn.energy,
          performance: overall,
          sleepQuality: checkIn.sleepQuality,
          sleepHours: checkIn.sleepHours,
          hydration: checkIn.hydration,
          nutrition: checkIn.nutrition,
          stress: checkIn.stress,
          motivation: checkIn.motivation,
          conditioningComfort: null,
          overallSatisfaction: overall,
          painNotes: existingReflection?.painNotes ?? '',
          winOfTheDay: win,
          struggleOfTheDay: struggle,
          freeformNotes: sessionNotes,
        }
        await db.workoutReflections.put(reflection)
      }

      await onSubmitted({ energy: checkIn.energy, overall })
    } finally {
      setIsSaving(false)
    }
  }

  const getMoodEmoji = (mood: number) => {
    if (mood <= 2) return '😔'
    if (mood <= 4) return '😕'
    if (mood <= 6) return '😐'
    if (mood <= 8) return '🙂'
    return '😄'
  }

  const getEnergyLabel = (energy: number) => {
    if (energy <= 2) return 'Exhausted'
    if (energy <= 4) return 'Low'
    if (energy <= 6) return 'Moderate'
    if (energy <= 8) return 'Good'
    return 'Energized'
  }

  return (
    <div className="space-y-6">
      {existingCheckIn && !isPostWorkout && (
        <div className="p-3 bg-primary/10 rounded-lg text-center">
          <p className="text-sm text-primary">
            You've already checked in today. Feel free to update your reflection.
          </p>
        </div>
      )}

      {/* Session section — post-workout only */}
      {isPostWorkout && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">The session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-muted-foreground">How was it?</label>
                <span className="text-xl font-bold tabular-nums">{overall}<span className="text-sm text-muted-foreground font-normal">/10</span></span>
              </div>
              <Slider value={overall} onChange={setOverall} min={1} max={10} />
            </div>

            <div>
              <label className="text-sm text-muted-foreground block mb-2">Session notes</label>
              <textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="How did the session feel? What worked, what didn't?"
                rows={4}
                className="w-full rounded-xl bg-secondary p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <Input
              label="Win of the day"
              placeholder="The best thing about today's session"
              value={win}
              onChange={e => setWin(e.target.value)}
            />
            <Input
              label="Challenge"
              placeholder="What was hardest?"
              value={struggle}
              onChange={e => setStruggle(e.target.value)}
            />
          </CardContent>
        </Card>
      )}

      {/* Mood & Energy Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            How are you feeling?
            <span className="text-2xl">{getMoodEmoji(checkIn.mood)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-muted-foreground">Mood</label>
              <span className="text-sm font-medium">{checkIn.mood}/10</span>
            </div>
            <Slider
              value={checkIn.mood}
              onChange={(v) => setCheckIn((c) => ({ ...c, mood: v }))}
              min={1}
              max={10}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-muted-foreground">Energy Level</label>
              <span className="text-sm font-medium">{getEnergyLabel(checkIn.energy)}</span>
            </div>
            <Slider
              value={checkIn.energy}
              onChange={(v) => setCheckIn((c) => ({ ...c, energy: v }))}
              min={1}
              max={10}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-muted-foreground">Motivation</label>
              <span className="text-sm font-medium">{checkIn.motivation}/10</span>
            </div>
            <Slider
              value={checkIn.motivation}
              onChange={(v) => setCheckIn((c) => ({ ...c, motivation: v }))}
              min={1}
              max={10}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-muted-foreground">Stress Level</label>
              <span className={cn(
                'text-sm font-medium',
                checkIn.stress >= 7 && 'text-destructive'
              )}>
                {checkIn.stress <= 3 ? 'Low' : checkIn.stress <= 6 ? 'Moderate' : 'High'}
              </span>
            </div>
            <Slider
              value={checkIn.stress}
              onChange={(v) => setCheckIn((c) => ({ ...c, stress: v }))}
              min={1}
              max={10}
            />
          </div>
        </CardContent>
      </Card>

      {/* Recovery Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recovery & Wellness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-muted-foreground">Sleep Quality</label>
              <span className="text-sm font-medium">{checkIn.sleepQuality}/10</span>
            </div>
            <Slider
              value={checkIn.sleepQuality}
              onChange={(v) => setCheckIn((c) => ({ ...c, sleepQuality: v }))}
              min={1}
              max={10}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-muted-foreground">Sleep Hours</label>
              <span className="text-sm font-medium">{checkIn.sleepHours}h</span>
            </div>
            <Slider
              value={checkIn.sleepHours}
              onChange={(v) => setCheckIn((c) => ({ ...c, sleepHours: v }))}
              min={4}
              max={10}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-muted-foreground">Hydration</label>
              <span className="text-sm font-medium">{checkIn.hydration}/10</span>
            </div>
            <Slider
              value={checkIn.hydration}
              onChange={(v) => setCheckIn((c) => ({ ...c, hydration: v }))}
              min={1}
              max={10}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-muted-foreground">Nutrition</label>
              <span className="text-sm font-medium">{checkIn.nutrition}/10</span>
            </div>
            <Slider
              value={checkIn.nutrition}
              onChange={(v) => setCheckIn((c) => ({ ...c, nutrition: v }))}
              min={1}
              max={10}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-muted-foreground">Muscle Soreness</label>
              <span className={cn(
                'text-sm font-medium',
                checkIn.soreness >= 7 && 'text-warning'
              )}>
                {checkIn.soreness <= 3 ? 'Minimal' : checkIn.soreness <= 6 ? 'Moderate' : 'Significant'}
              </span>
            </div>
            <Slider
              value={checkIn.soreness}
              onChange={(v) => setCheckIn((c) => ({ ...c, soreness: v }))}
              min={1}
              max={10}
            />
          </div>
        </CardContent>
      </Card>

      {/* Daily Reflection Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Reflection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-2">
              Highlight of the day
            </label>
            <Input
              placeholder="What went well today?"
              value={checkIn.highlight}
              onChange={(e) => setCheckIn((c) => ({ ...c, highlight: e.target.value }))}
            />
          </div>

          {/* In post-workout mode the session "Challenge" above covers this. */}
          {!isPostWorkout && (
            <div>
              <label className="text-sm text-muted-foreground block mb-2">
                Challenge
              </label>
              <Input
                placeholder="What was difficult?"
                value={checkIn.challenge}
                onChange={(e) => setCheckIn((c) => ({ ...c, challenge: e.target.value }))}
              />
            </div>
          )}

          <div>
            <label className="text-sm text-muted-foreground block mb-2">
              Gratitude
            </label>
            <Input
              placeholder="What are you grateful for?"
              value={checkIn.gratitude}
              onChange={(e) => setCheckIn((c) => ({ ...c, gratitude: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-2">
              Notes (optional)
            </label>
            <textarea
              placeholder="Anything else on your mind..."
              value={checkIn.notes}
              onChange={(e) => setCheckIn((c) => ({ ...c, notes: e.target.value }))}
              className="w-full h-20 bg-secondary rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </CardContent>
      </Card>

      {renderActions ? (
        renderActions({ submit: handleSubmit, isSaving })
      ) : (
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          loading={isSaving}
        >
          {submitLabel ?? (existingCheckIn ? 'Update Check-In' : 'Complete Check-In')}
        </Button>
      )}
    </div>
  )
}
