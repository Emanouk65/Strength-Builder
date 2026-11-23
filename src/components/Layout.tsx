import { type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { getCurrentUser, getDraftWorkout } from '@/db'
import { cn } from '@/lib/utils'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const user = useLiveQuery(() => getCurrentUser(), [])
  const draft = useLiveQuery(
    () => user ? getDraftWorkout(user.id) : Promise.resolve(undefined),
    [user?.id]
  )
  const hasDraft = !!draft

  // Hide nav during workout execution and planning.
  const hideNav =
    location.pathname.startsWith('/workout/') ||
    location.pathname.startsWith('/plan')

  return (
    <div className="flex min-h-screen flex-col safe-area-inset">
      <main className={cn('flex-1', !hideNav && 'pb-28')}>{children}</main>

      {/* Floating glass tab bar */}
      {!hideNav && (
        <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
          <div className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-1 rounded-full glass-bar p-1.5">
            <NavItem to="/" icon={HomeIcon} label="Today" />
            <NavItem to="/history" icon={ChartIcon} label="History" />

            {/* Plan opens the existing draft if there is one, so exercises aren't lost. */}
            <button
              onClick={() => navigate(draft ? `/plan/${draft.id}` : '/plan')}
              className={cn(
                'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
                'bg-white text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_20px_rgba(255,255,255,0.12)]',
                'transition-transform duration-200 active:scale-95'
              )}
              aria-label={hasDraft ? 'Resume drafted workout' : 'Plan a workout'}
            >
              <PlusIcon className="h-6 w-6" />
              {hasDraft && (
                <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-sky-400 ring-2 ring-black" aria-hidden />
              )}
            </button>

            <NavItem to="/lift-records" icon={TrophyIcon} label="Records" />
            <NavItem to="/coach" icon={ProgramIcon} label="Program" />
          </div>
        </nav>
      )}
    </div>
  )
}

interface NavItemProps {
  to: string
  icon: React.FC<{ className?: string }>
  label: string
}

function NavItem({ to, icon: Icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'relative flex flex-1 flex-col items-center justify-center gap-0.5 h-12 rounded-full text-[10px] font-medium transition-colors touch-target',
          isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="nav-indicator"
              className="absolute inset-0 rounded-full bg-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            />
          )}
          <Icon className="relative z-10 h-[21px] w-[21px]" />
          <span className={cn('relative z-10', isActive && 'font-semibold')}>{label}</span>
        </>
      )}
    </NavLink>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M7 4h10v6a5 5 0 11-10 0V4zM7 4H4v3a3 3 0 003 3M17 4h3v3a3 3 0 01-3 3" />
    </svg>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function ProgramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M7.5 13.5h3M7.5 16.5h6" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}
