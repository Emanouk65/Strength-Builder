import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { getCurrentUser, getActiveProgram, resolveExercises } from '@/db'
import {
  generateProgramPlan,
  materializeProgram,
  defaultStartDate,
  ProgramGenerationError,
  type GenerationResult,
} from '@/lib/programGeneration'
import { Button, Card, CardContent } from '@/components/ui'
import { cn, formatDate, getLocalDateString } from '@/lib/utils'

type CoachStage = 'intake' | 'generating' | 'preview'

const LOADING_LINES = [
  'Reading your training history…',
  'Weighing your goals against your e1RMs…',
  'Structuring the training week…',
  'Setting loads and progression…',
  'Almost there — validating the plan…',
]

export function Coach() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())
  const activeProgram = useLiveQuery(
    async () => (user ? (await getActiveProgram(user.id)) ?? null : null),
    [user]
  )

  const [stage, setStage] = useState<CoachStage>('intake')
  const [goalText, setGoalText] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [startDate, setStartDate] = useState<string>(getLocalDateString(defaultStartDate()))
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loadingLine, setLoadingLine] = useState(0)
  const [isAccepting, setIsAccepting] = useState(false)

  if (!user) return null

  const hasApiKey = Boolean(user.apiKey)

  const handleGenerate = async () => {
    setError(null)
    setStage('generating')
    setLoadingLine(0)
    const ticker = setInterval(() => {
      setLoadingLine(l => Math.min(l + 1, LOADING_LINES.length - 1))
    }, 9000)
    try {
      const gen = await generateProgramPlan(user, goalText, weeks)
      const ids = [...new Set(gen.plan.days.flatMap(d => d.exercises.map(e => e.exerciseId)))]
      const names = await resolveExercises(ids)
      setExerciseNames(new Map([...names].map(([id, ex]) => [id, ex.name])))
      setResult(gen)
      setStage('preview')
    } catch (err) {
      setError(
        err instanceof ProgramGenerationError
          ? err.message
          : 'Something went wrong generating the program. Try again.'
      )
      setStage('intake')
    } finally {
      clearInterval(ticker)
    }
  }

  const handleAccept = async () => {
    if (!result) return
    setIsAccepting(true)
    try {
      const start = new Date(startDate + 'T09:00:00')
      await materializeProgram(user.id, result, goalText, start)
      navigate('/', { replace: true })
    } catch {
      setError('Failed to save the program. Try again.')
      setIsAccepting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-12 pb-5 flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors -ml-1"
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">AI Coach</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Build a program</h1>
        </div>
      </header>

      {/* No API key gate */}
      {!hasApiKey && (
        <div className="px-5">
          <Card>
            <CardContent className="pt-6 pb-6 text-center">
              <span className="text-4xl">🔑</span>
              <p className="font-semibold mt-3">Connect Claude first</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                The Coach uses your Claude API key (stored only on this device) to design programs around your goals, records, and recovery.
              </p>
              <Button onClick={() => navigate('/settings')}>Open Settings</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {hasApiKey && stage === 'intake' && (
        <div className="px-5 space-y-5">
          {activeProgram && (
            <div className="rounded-2xl bg-secondary/50 border border-border/40 p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Current program</p>
              <p className="text-sm font-semibold mt-1">{activeProgram.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Started {formatDate(activeProgram.startDate)} · {activeProgram.weeksCount} weeks · generating a new program will replace its remaining workouts
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <section>
            <h2 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-2">
              What do you want out of this program?
            </h2>
            <textarea
              value={goalText}
              onChange={e => setGoalText(e.target.value)}
              placeholder={'e.g. "Build my squat and bench back up after the summer, 4 days a week, keep some conditioning. Left knee gets cranky on deep lunges."'}
              rows={5}
              className="w-full rounded-2xl bg-card border border-border/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/30 focus:border-foreground/40 transition-colors resize-none"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Your profile, injuries, live 1RM records, and recent check-ins are included automatically.
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card border border-border/50 p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Length</p>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setWeeks(w => Math.max(2, w - 1))}
                  className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center text-lg font-bold active:scale-95 transition-transform"
                  aria-label="Fewer weeks"
                >
                  −
                </button>
                <span className="text-lg font-bold tabular-nums">{weeks} wks</span>
                <button
                  onClick={() => setWeeks(w => Math.min(12, w + 1))}
                  className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center text-lg font-bold active:scale-95 transition-transform"
                  aria-label="More weeks"
                >
                  +
                </button>
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-border/50 p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Starts</p>
              <input
                type="date"
                value={startDate}
                min={getLocalDateString()}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none"
              />
            </div>
          </section>

          <Button className="w-full" size="lg" onClick={handleGenerate}>
            ✨ Generate program
          </Button>
        </div>
      )}

      {hasApiKey && stage === 'generating' && (
        <div className="px-5 pt-16 flex flex-col items-center text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
            className="h-12 w-12 rounded-full border-4 border-secondary border-t-foreground"
          />
          <p className="font-semibold mt-6">Designing your program</p>
          <motion.p
            key={loadingLine}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-muted-foreground mt-1"
          >
            {LOADING_LINES[loadingLine]}
          </motion.p>
          <p className="text-xs text-muted-foreground/60 mt-6">This usually takes 30–60 seconds.</p>
        </div>
      )}

      {hasApiKey && stage === 'preview' && result && (
        <div className="px-5 space-y-5 pb-28">
          <div className="rounded-2xl bg-card border border-border/50 p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Proposed program</p>
            <h2 className="text-lg font-bold mt-1">{result.plan.name}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {result.plan.weeksCount} weeks · {result.plan.days.length} days/week · starts {formatDate(new Date(startDate + 'T09:00:00'))}
            </p>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{result.plan.summary}</p>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-2xl bg-warning/10 border border-warning/30 p-4">
              <p className="text-xs font-semibold text-warning mb-1.5">Adjustments made</p>
              <ul className="space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {result.plan.days.map((day, di) => (
            <div key={di} className="rounded-2xl bg-card border border-border/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40 bg-secondary/20">
                <p className="text-sm font-bold">{day.name}</p>
              </div>
              <div className="p-3 space-y-1.5">
                {day.exercises.map((ex, ei) => (
                  <div key={ei} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {exerciseNames.get(ex.exerciseId) ?? ex.exerciseId}
                        {ex.supersetGroup != null && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">SS{ex.supersetGroup}</span>
                        )}
                      </p>
                      {ex.note && <p className="text-xs text-muted-foreground truncate">{ex.note}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {ex.sets}×{ex.reps}
                      {ex.percent1RM != null && ` @ ${ex.percent1RM}%`}
                      {ex.percent1RM == null && ex.targetRPE != null && ` @ RPE ${ex.targetRPE}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-2xl bg-secondary/40 border border-border/30 p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Weekly progression:{' '}
              {result.plan.weeklyProgression.map(w =>
                `Wk ${w.week} ×${w.intensityMultiplier.toFixed(2)}${w.isDeload ? ' (deload)' : ''}`
              ).join(' · ')}
            </p>
          </div>

          {/* Sticky action bar */}
          <div className="fixed bottom-0 inset-x-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border/40 safe-area-bottom">
            <div className="max-w-lg mx-auto px-5 py-3 flex gap-2">
              <Button variant="ghost" onClick={() => setStage('intake')} className="flex-1" disabled={isAccepting}>
                Redo
              </Button>
              <Button onClick={handleAccept} loading={isAccepting} className={cn('flex-[2]')}>
                Accept & schedule
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
