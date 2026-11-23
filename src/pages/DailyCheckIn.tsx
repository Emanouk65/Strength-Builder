import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCurrentUser } from '@/db'
import { CheckInForm } from '@/components/CheckInForm'

export function DailyCheckInPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/'

  const user = useLiveQuery(() => getCurrentUser())
  const [showSuccess, setShowSuccess] = useState(false)

  if (!user) return null

  if (showSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="animate-bounce-in h-16 w-16 rounded-full bg-white text-black flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-2xl font-bold mt-6">Checked in</h1>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(returnTo)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center flex-1">
            <h1 className="text-xl font-bold">Daily Check-In</h1>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <CheckInForm
        userId={user.id}
        onSubmitted={() => {
          setShowSuccess(true)
          // Show success briefly then navigate.
          setTimeout(() => navigate(returnTo), 1500)
        }}
      />
    </div>
  )
}
