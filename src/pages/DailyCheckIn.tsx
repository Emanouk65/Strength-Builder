import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCurrentUser, saveDailyCheckIn, getTodaysCheckIn } from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Slider } from '@/components/ui'
import { cn, generateId, getLocalDateString } from '@/lib/utils'
import type { DailyCheckIn } from '@/lib/types'

export function DailyCheckInPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const workoutId = searchParams.get('workoutId')
  const returnTo = searchParams.get('returnTo') || '/'

  const user = useLiveQuery(() => getCurrentUser())
  const existingCheckIn = useLiveQuery(
    async () => {
      if (!user) return null
      return getTodaysCheckIn(user.id)
    },
    [user]
  )

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
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // Load existing check-in data if available
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
    if (!user) return
    setIsSaving(true)

    const today = getLocalDateString()

    const checkInData: DailyCheckIn = {
      id: existingCheckIn?.id || generateId(),
      userId: user.id,
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
      challenge: checkIn.challenge,
      gratitude: checkIn.gratitude,
      notes: checkIn.notes,
      workoutId: workoutId,
    }

    await saveDailyCheckIn(checkInData)
    setIsSaving(false)
    setShowSuccess(true)

    // Show success briefly then navigate
    setTimeout(() => {
      navigate(returnTo)
    }, 1500)
  }

  if (!user) return null

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="animate-bounce-in">
          <span className="text-7xl">✨</span>
        </div>
        <h1 className="text-2xl font-bold mt-6 mb-2">Check-in Complete!</h1>
        <p className="text-muted-foreground">
          Thanks for reflecting on your day.
        </p>
      </div>
    )
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
    <div className="min-h-screen bg-background p-4 pb-8">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(returnTo)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center flex-1">
            <h1 className="text-xl font-bold">Daily Check-In</h1>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="w-10" />
        </div>
      </header>

      {existingCheckIn && (
        <div className="mb-4 p-3 bg-primary/10 rounded-lg text-center">
          <p className="text-sm text-primary">
            You've already checked in today. Feel free to update your reflection.
          </p>
        </div>
      )}

      <div className="space-y-6">
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
                  "text-sm font-medium",
                  checkIn.stress >= 7 && "text-destructive"
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
                  "text-sm font-medium",
                  checkIn.soreness >= 7 && "text-warning"
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

        {/* Reflection Section */}
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

        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          loading={isSaving}
        >
          {existingCheckIn ? 'Update Check-In' : 'Complete Check-In'}
        </Button>
      </div>
    </div>
  )
}
