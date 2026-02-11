import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCurrentUser, getAllPRs, addManualLiftRecord } from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge } from '@/components/ui'
import { cn, formatDate } from '@/lib/utils'
import { MAJOR_LIFTS } from '@/lib/constants'
import type { LiftRecord } from '@/lib/types'

export function LiftRecords() {
  const navigate = useNavigate()
  const user = useLiveQuery(() => getCurrentUser())
  const prs = useLiveQuery(
    async () => {
      if (!user) return []
      return getAllPRs(user.id)
    },
    [user]
  )

  const [editingLift, setEditingLift] = useState<string | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  if (!user) return null

  const handleSavePR = async (liftId: string) => {
    if (!weight || !reps) return

    setIsSaving(true)
    try {
      await addManualLiftRecord(
        user.id,
        liftId,
        parseFloat(weight),
        parseInt(reps)
      )
      setEditingLift(null)
      setWeight('')
      setReps('')
    } catch (error) {
      console.error('Failed to save PR:', error)
    }
    setIsSaving(false)
  }

  const getPRForLift = (liftId: string): LiftRecord | undefined => {
    return prs?.find(pr => pr.exerciseId === liftId)
  }

  const calculateEstimated1RM = (weight: number, reps: number): number => {
    return reps === 1 ? weight : Math.round(weight * (1 + reps / 30))
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      <header className="mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="h-8 w-8 p-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Lift Records</h1>
            <p className="text-sm text-muted-foreground">Track your personal records</p>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        {MAJOR_LIFTS.map((lift) => {
          const pr = getPRForLift(lift.id)
          const isEditing = editingLift === lift.id

          return (
            <Card key={lift.id} className={cn(isEditing && 'border-primary')}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{lift.icon}</span>
                    <CardTitle className="text-base">{lift.name}</CardTitle>
                  </div>
                  {pr && !isEditing && (
                    <Badge variant="outline" className="font-mono">
                      {pr.estimated1RM} {user.preferences.weightUnit} e1RM
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">
                          Weight ({user.preferences.weightUnit})
                        </label>
                        <Input
                          type="number"
                          placeholder="225"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          className="h-12"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">
                          Reps
                        </label>
                        <Input
                          type="number"
                          placeholder="5"
                          value={reps}
                          onChange={(e) => setReps(e.target.value)}
                          className="h-12"
                        />
                      </div>
                    </div>

                    {weight && reps && (
                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <p className="text-sm text-muted-foreground">
                          Estimated 1RM:{' '}
                          <span className="text-primary font-bold">
                            {calculateEstimated1RM(parseFloat(weight), parseInt(reps))} {user.preferences.weightUnit}
                          </span>
                        </p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setEditingLift(null)
                          setWeight('')
                          setReps('')
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => handleSavePR(lift.id)}
                        disabled={!weight || !reps || isSaving}
                        loading={isSaving}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {pr ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-2xl font-bold font-mono">
                            {pr.weight} × {pr.reps}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(pr.date)} · {pr.isManualEntry ? 'Manual entry' : 'From workout'}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingLift(lift.id)
                            setWeight(pr.weight.toString())
                            setReps(pr.reps.toString())
                          }}
                        >
                          Update
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="w-full text-muted-foreground"
                        onClick={() => setEditingLift(lift.id)}
                      >
                        + Add your PR
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="mt-8 p-4 rounded-lg bg-secondary/50">
        <h3 className="font-medium text-sm mb-2">About Estimated 1RM</h3>
        <p className="text-xs text-muted-foreground">
          We use the Epley formula to calculate your estimated one-rep max (e1RM) from your best lifts.
          This helps suggest appropriate weights for your training.
        </p>
      </div>
    </div>
  )
}
