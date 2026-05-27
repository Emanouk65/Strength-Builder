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
    <div className="flex min-h-screen flex-col bg-background safe-area-inset">
      {/* Main content */}
      <main className={cn('flex-1', !hideNav && 'pb-20')}>{children}</main>

      {/* Bottom navigation */}
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
          {/* Blur backdrop */}
          <div className="absolute inset-0 bg-card/90 backdrop-blur-xl border-t border-border/50" />

          <div className="relative mx-auto flex max-w-lg items-center justify-around px-2">
            <NavItem to="/" icon={HomeIcon} label="Today" />
            <NavItem to="/history" icon={ChartIcon} label="History" />

            {/* Center Plan FAB — navigates directly to the existing draft if any,
                bypassing /plan bootstrap. Prevents lost exercises on re-entry. */}
            <div className="relative -mt-5">
              <button
                onClick={() => navigate(draft ? `/plan/${draft.id}` : '/plan')}
                className={cn(
                  'relative flex h-14 w-14 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground',
                  'shadow-glow transition-all duration-200',
                  'hover:scale-105 hover:shadow-[0_0_24px_rgba(255,255,255,0.25)]',
                  'active:scale-95'
                )}
                aria-label={hasDraft ? 'Resume drafted workout' : 'Plan a workout'}
              >
                <PlusIcon className="h-7 w-7" />
                {hasDraft && (
                  <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-foreground border-2 border-background animate-pulse-slow" aria-hidden />
                )}
              </button>
            </div>

            <NavItem to="/lift-records" icon={TrophyIcon} label="Records" />
            <NavItem to="/settings" icon={SettingsIcon} label="Settings" />
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
          'relative flex flex-col items-center justify-center gap-1 w-16 h-14 my-1 rounded-2xl text-xs font-medium transition-colors touch-target',
          isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="nav-indicator"
              className="absolute inset-0 rounded-2xl bg-secondary/80"
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            />
          )}
          <Icon className={cn('relative z-10 h-5 w-5')} />
          <span className={cn('relative z-10 text-[10px]', isActive && 'font-semibold')}>{label}</span>
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

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
