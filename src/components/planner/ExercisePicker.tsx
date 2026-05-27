import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { EXERCISE_LIBRARY, searchExercises } from '@/db/exercises'
import { getCustomExercises } from '@/db'
import { Sheet, Badge } from '@/components/ui'
import type { Exercise, ExerciseCategory } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ExercisePickerProps {
  open: boolean
  onClose: () => void
  onPick: (exercise: Exercise) => void
  /** IDs already in the workout — picker shows these dimmed. */
  alreadyAddedIds?: string[]
}

const CATEGORY_LABELS: Array<{ key: 'all' | ExerciseCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'compound', label: 'Compound' },
  { key: 'accessory', label: 'Accessory' },
  { key: 'isolation', label: 'Isolation' },
  { key: 'core', label: 'Core' },
  { key: 'conditioning', label: 'Cond.' },
  { key: 'cardio', label: 'Cardio' },
]

export function ExercisePicker({ open, onClose, onPick, alreadyAddedIds = [] }: ExercisePickerProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | ExerciseCategory>('all')

  const customExercises = useLiveQuery(() => getCustomExercises(), []) ?? []

  const results = useMemo(() => {
    let list: Exercise[]
    if (query.trim()) {
      list = searchExercises(query.trim(), customExercises)
    } else {
      list = [...EXERCISE_LIBRARY, ...customExercises]
    }
    if (category !== 'all') {
      list = list.filter(e => e.category === category)
    }
    // Sort: compound first, alphabetical within group.
    return list.sort((a, b) => {
      if (a.isCompound !== b.isCompound) return a.isCompound ? -1 : 1
      return a.name.localeCompare(b.name)
    }).slice(0, 80) // cap for performance
  }, [query, category, customExercises])

  const addedSet = useMemo(() => new Set(alreadyAddedIds), [alreadyAddedIds])

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise" className="max-h-[92vh]" noDrag>
      <div className="flex flex-col gap-3">
        {/* Search */}
        <input
          autoFocus
          type="text"
          placeholder="Search exercises…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-xl border border-border/50 bg-input px-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/60"
        />

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
          {CATEGORY_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={cn(
                'shrink-0 h-8 px-3 rounded-full text-xs font-medium transition-colors',
                category === key
                  ? 'bg-primary text-white'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="flex flex-col gap-1.5">
          {results.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">No exercises match "{query}"</div>
          ) : (
            results.map((ex, i) => {
              const added = addedSet.has(ex.id)
              return (
                <motion.button
                  key={ex.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.012 }}
                  onClick={() => {
                    onPick(ex)
                    onClose()
                  }}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-left',
                    'border border-transparent hover:border-border bg-secondary/40 hover:bg-secondary/70',
                    'transition-colors active:scale-[0.985]',
                    added && 'opacity-50'
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{ex.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {ex.primaryMuscles.slice(0, 2).join(', ')}
                      {ex.equipment[0] && ex.equipment[0] !== 'none' && ` · ${ex.equipment[0].replace(/_/g, ' ')}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ex.isCompound && <Badge variant="secondary" className="text-[10px]">Compound</Badge>}
                    {added && <span className="text-[10px] text-muted-foreground">Added</span>}
                  </div>
                </motion.button>
              )
            })
          )}
        </div>
      </div>
    </Sheet>
  )
}
