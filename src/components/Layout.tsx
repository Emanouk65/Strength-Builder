import { type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()

  // Hide nav during workout execution and quick log
  const hideNav =
    location.pathname.startsWith('/workout/') || location.pathname === '/quick-log'

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
            <NavItem to="/program" icon={CalendarIcon} label="Program" />

            {/* Center Quick Log FAB */}
            <div className="relative -mt-5">
              <button
                onClick={() => navigate('/quick-log')}
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-full',
                  'bg-gradient-to-br from-primary to-[#3354DD]',
                  'shadow-glow transition-all duration-200',
                  'hover:scale-105 hover:shadow-[0_0_28px_rgba(67,97,238,0.65)]',
                  'active:scale-95'
                )}
                aria-label="Start Quick Workout"
              >
                <PlusIcon className="h-7 w-7 text-white" />
              </button>
            </div>

            <NavItem to="/history" icon={ChartIcon} label="History" />
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
          'flex flex-col items-center gap-0.5 px-4 py-3 text-xs font-medium transition-colors touch-target',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
          <span className={cn('text-[10px]', isActive && 'text-primary')}>{label}</span>
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

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
