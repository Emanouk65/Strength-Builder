import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { initializeDatabase, getCurrentUser } from '@/db'

// Pages
import { Dashboard } from '@/pages/Dashboard'
import { Onboarding } from '@/pages/Onboarding'
import { Workout } from '@/pages/Workout'
import { Program } from '@/pages/Program'
import { History } from '@/pages/History'
import { Settings } from '@/pages/Settings'
import { QuickLog } from '@/pages/QuickLog'
import { DailyCheckInPage } from '@/pages/DailyCheckIn'
import { LiftRecords } from '@/pages/LiftRecords'
import { Layout } from '@/components/Layout'

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
        setIsInitialized(true)
      })

    return () => clearTimeout(timeoutId)
  }, [])

  if (!isInitialized) {
    return <LoadingScreen />
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
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workout/:workoutId?" element={<Workout />} />
        <Route path="/quick-log" element={<QuickLog />} />
        <Route path="/check-in" element={<DailyCheckInPage />} />
        <Route path="/program" element={<Program />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/lift-records" element={<LiftRecords />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App
