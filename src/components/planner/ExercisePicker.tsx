import { useMemo, useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { EXERCISE_LIBRARY, searchExercises } from '@/db/exercises'
import { getCustomExercises } from '@/db'
import { Sheet } from '@/components/ui'
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
  // Picks made since the sheet opened. The sheet stays open so several
  // exercises can be added in one pass instead of reopening it each time.
  const [picked, setPicked] = useState<string[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const customExercises = useLiveQuery(() => getCustomExercises(), []) ?? []

  // Reset the picker state every time it opens so each session starts fresh.
  useEffect(() => {
    if (open) {
      setQuery('')
      setCategory('all')
      setPicked([])
      // Scroll the results back to top on each open.
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo({ top: 0 })
      })
    }
  }, [open])

  // When the user changes the search query or category, snap results back to
  // top — otherwise the list keeps the previous scroll offset and looks broken.
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 })
  }, [query, category])

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
    return list.sort((a, b) => {
      if (a.isCompound !== b.isCompound) return a.isCompound ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [query, category, customExercises])

  const addedSet = useMemo(() => new Set(alreadyAddedIds), [alreadyAddedIds])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      className="flex flex-col"
      noDrag
      noPadding
    >
      <div className="flex flex-col h-full min-h-0">
        {/* Pinned header — search and filters never scroll away */}
        <div className="px-4 pt-2 pb-3 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground flex-1 pl-1">Add exercises</h2>
            <button
              onClick={onClose}
              className={cn(
                'h-9 px-4 rounded-full text-sm font-semibold transition-colors',
                picked.length > 0 ? 'bg-white text-black' : 'glass-soft text-foreground'
              )}
            >
              {picked.length > 0 ? `Done · ${picked.length}` : 'Done'}
            </button>
          </div>

          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full rounded-full glass-soft pl-10 pr-10 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pt-3 -mx-4 px-4">
            {CATEGORY_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={cn(
                  'shrink-0 h-8 px-3.5 rounded-full text-xs font-medium transition-colors',
                  category === key ? 'bg-white text-black' : 'glass-soft text-foreground/75 hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-4 border-t border-white/[0.06]"
        >
          {results.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">No matches</div>
          ) : (
            <ul className="flex flex-col py-1">
              {results.map((ex) => {
                const pickedCount = picked.filter(id => id === ex.id).length
                const inWorkout = addedSet.has(ex.id) || pickedCount > 0
                return (
                  <li key={ex.id}>
                    <button
                      onClick={() => {
                        onPick(ex)
                        setPicked(p => [...p, ex.id])
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-medium text-foreground truncate">{ex.name}</div>
                        <div className="text-xs text-muted-foreground truncate capitalize">
                          {ex.primaryMuscles.slice(0, 2).map(m => m.replace(/_/g, ' ')).join(' · ')}
                          {ex.equipment[0] && ex.equipment[0] !== 'none' && ` · ${ex.equipment[0].replace(/_/g, ' ')}`}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'h-7 w-7 shrink-0 flex items-center justify-center rounded-full transition-colors',
                          inWorkout ? 'bg-white text-black' : 'glass-soft text-foreground/70'
                        )}
                        aria-hidden
                      >
                        {inWorkout ? (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  )
}
