import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, resolveExercises } from '@/db'
import { fetchInboxProgram, installInboxProgram, previewInboxProgram, type InboxState } from '@/lib/programInbox'
import type { GenerationResult } from '@/lib/programGeneration'
import { Button, Card, CardContent } from '@/components/ui'

/**
 * Shows a training block Cato left in the LifeOS repo and installs it with one
 * tap. Renders nothing when sync is off, the inbox is empty, or the block is
 * already installed, so it costs the Coach page nothing in the normal case.
 */
export function ProgramInboxCard() {
  const navigate = useNavigate()
  const [state, setState] = useState<InboxState | null>(null)
  const [preview, setPreview] = useState<GenerationResult | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await fetchInboxProgram()
      if (!alive) return
      setState(s)
      if (s.program && !s.installed) {
        try {
          const user = await getCurrentUser()
          if (!user) return
          const gen = await previewInboxProgram(user, s.program)
          const ids = [...new Set(gen.plan.days.flatMap(d => d.exercises.map(e => e.exerciseId)))]
          const map = await resolveExercises(ids)
          if (!alive) return
          setNames(new Map([...map].map(([id, ex]) => [id, ex.name])))
          setPreview(gen)
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : 'Could not read the program.')
        }
      }
    })()
    return () => { alive = false }
  }, [])

  if (!state || !state.configured) return null
  if (state.error) {
    return (
      <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4">
        <p className="text-sm text-destructive">Program inbox: {state.error}</p>
      </div>
    )
  }
  if (!state.program || state.installed) return null

  const p = state.program

  const handleInstall = async () => {
    setBusy(true)
    setError(null)
    try {
      await installInboxProgram(p)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to install the program.')
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">From {p.source}</p>
        <p className="text-lg font-bold tracking-tight mt-1">{preview?.plan.name ?? 'New training block'}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {p.weeksCount} weeks · {preview ? `${preview.plan.days.length} days/week · ` : ''}starts {p.startDate || 'today'}
        </p>
        {preview?.plan.summary && <p className="text-sm text-muted-foreground mt-3">{preview.plan.summary}</p>}

        {preview && (
          <div className="mt-4 space-y-3">
            {preview.plan.days.map((d, i) => (
              <div key={i}>
                <p className="text-xs font-semibold">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {d.exercises.map(e => `${names.get(e.exerciseId) ?? e.exerciseId} ${e.sets}×${e.reps}`).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}

        {preview?.plan.weekDays && (
          <p className="text-xs text-muted-foreground mt-3">Week 1 shown. The movements after each main lift change every week.</p>
        )}

        {preview && preview.warnings.length > 0 && (
          <ul className="mt-3 text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
            {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}

        {error && <p className="text-sm text-destructive mt-3">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button onClick={handleInstall} disabled={busy || !preview}>
            {busy ? 'Scheduling…' : 'Install and schedule'}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Replaces the remaining workouts of your current program. Completed history is kept.
        </p>
      </CardContent>
    </Card>
  )
}
