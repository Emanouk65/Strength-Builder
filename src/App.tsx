import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { initializeDatabase, getCurrentUser } from '@/db'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { pageMotion } from '@/lib/utils'

// Pages
import { Dashboard } from '@/pages/Dashboard'
import { Onboarding } from '@/pages/Onboarding'
import { Workout } from '@/pages/Workout'
import { Program } from '@/pages/Program'
import { History } from '@/pages/History'
import { Settings } from '@/pages/Settings'
import { DailyCheckInPage } from '@/pages/DailyCheckIn'
import { LiftRecords } from '@/pages/LiftRecords'
import { Plan } from '@/pages/Plan'
import { Layout } from '@/components/Layout'

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={pageMotion.initial}
        animate={pageMotion.animate}
        exit={pageMotion.exit}
        transition={pageMotion.transition}
      >
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workout/:workoutId?" element={<Workout />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/plan/:workoutId" element={<Plan />} />
          <Route path="/check-in" element={<DailyCheckInPage />} />
          <Route path="/program" element={<Program />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/lift-records" element={<LiftRecords />} />
          {/* Legacy redirects */}
          <Route path="/quick-log" element={<Navigate to="/plan" replace />} />
          <Route path="/active-workout" element={<Navigate to="/plan" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

function App() {
  const [isInitialized, setIsInitialized] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  // Auto-reload when a new version is deployed
  useRegisterSW({
    onNeedRefresh() {
      window.location.reload()
    },
  })

  const localUser = useLiveQuery(async () => {
    const result = await getCurrentUser()
    return result ?? null
  })

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      console.warn('Database initialization taking too long, proceeding anyway')
      setIsInitialized(true)
    }, 5000)

    initializeDatabase()
      .then(() => {
        clearTimeout(timeoutId)
        setIsInitialized(true)
      })
      .catch((error) => {
        console.error('Database initialization error:', error)
        clearTimeout(timeoutId)
        setInitError(error instanceof Error ? error.message : 'Failed to initialize database')
        setIsInitialized(true)
      })

    return () => clearTimeout(timeoutId)
  }, [])

  if (!isInitialized) {
    return <LoadingScreen />
  }

  if (initError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Database Error</h1>
          <p className="text-sm text-muted-foreground mb-4">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary text-white font-medium text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Still loading local user
  if (localUser === undefined) {
    return <LoadingScreen />
  }

  // No local user - show onboarding
  if (localUser === null) {
    return (
      <Routes>
        <Route path="/onboarding/*" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  // Has local user - show workout app
  return (
    <Layout>
      <AnimatedRoutes />
    </Layout>
  )
}

function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

export default AppWithErrorBoundary
