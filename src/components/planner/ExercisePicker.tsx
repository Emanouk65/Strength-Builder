import { useMemo, useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
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
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const customExercises = useLiveQuery(() => getCustomExercises(), []) ?? []

  // Reset the picker state every time it opens so each session starts fresh.
  useEffect(() => {
    if (open) {
      setQuery('')
      setCategory('all')
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
      className="max-h-[92vh] flex flex-col"
      noDrag
      noPadding
    >
      <div className="flex flex-col h-full">
        {/* Pinned header — search bar + category chips never scroll away */}
        <div className="px-5 pt-3 pb-3 border-b border-border/30 bg-card sticky top-0 z-10">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-base font-semibold text-foreground flex-1">Add exercise</h2>
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search input — plain text input with explicit search icon */}
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
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
              placeholder="Search exercises…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-border/50 bg-input pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/30 focus:border-foreground/40"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pt-3 -mx-1 px-1">
            {CATEGORY_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={cn(
                  'shrink-0 h-8 px-3 rounded-full text-xs font-medium transition-colors',
                  category === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable results */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-5 py-3"
          style={{ maxHeight: 'calc(92vh - 165px)' }}
        >
          {results.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              No exercises match {query ? `"${query}"` : 'this filter'}
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {results.map((ex) => {
                const added = addedSet.has(ex.id)
                return (
                  <li key={ex.id}>
                    <button
                      onClick={() => {
                        onPick(ex)
                        onClose()
                      }}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-left',
                        'border border-transparent hover:border-border bg-secondary/40 hover:bg-secondary/70',
                        'transition-colors active:scale-[0.985]',
                        added && 'opacity-50'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">{ex.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {ex.primaryMuscles.slice(0, 2).map(m => m.replace(/_/g, ' ')).join(' · ')}
                          {ex.equipment[0] && ex.equipment[0] !== 'none' && ` · ${ex.equipment[0].replace(/_/g, ' ')}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ex.isCompound && <Badge variant="secondary" className="text-[10px]">Compound</Badge>}
                        {added && <span className="text-[10px] text-muted-foreground">Added</span>}
                      </div>
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
