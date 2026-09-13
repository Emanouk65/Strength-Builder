import { cn } from '@/lib/utils'

/**
 * Shimmering placeholder block for initial loads — useLiveQuery returns
 * undefined on first paint, and a skeleton beats a blank flash.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-secondary/60', className)} aria-hidden />
}
