import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getCurrentUser, clearUserData, exportUserData, importUserData, getAppSettings, updateAppSettings } from '@/db'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { UserPreferences, AppSettings } from '@/lib/types'

export function Settings() {
  const navigate = useNavigate()
  const localUser = useLiveQuery(() => getCurrentUser())

  const settings = useLiveQuery(() => getAppSettings(), [])

  const [apiKey, setApiKey] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const handleToggleSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await updateAppSettings({ [key]: value } as Partial<AppSettings>)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setImportError(null)
    try {
      const text = await file.text()
      await importUserData(text)
      window.location.reload()
    } catch (err) {
      console.error('Import failed:', err)
      setImportError('That file could not be imported. Make sure it is a FORGE backup.')
    }
  }

  if (!localUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    )
  }

  const handleSaveApiKey = async () => {
    setIsSaving(true)
    await db.users.update(localUser.id, { apiKey: apiKey || null })
    setIsSaving(false)
    setApiKey('')
  }

  const handleUpdatePreference = async <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    await db.users.update(localUser.id, {
      preferences: {
        ...localUser.preferences,
        [key]: value,
      },
    })
  }

  const handleExport = async () => {
    const data = await exportUserData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forge-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleReset = async () => {
    if (
      confirm(
        'Are you sure you want to reset all data? This cannot be undone. Your workouts, reflections, and programs will be permanently deleted.'
      )
    ) {
      await clearUserData()
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your training system</p>
      </header>

      <div className="space-y-6">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="font-medium">{localUser.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Experience</span>
              <Badge variant="outline">
                {localUser.preferences.experienceLevel === 'advanced' ? 'Advanced' : 'Intermediate'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Primary Goal</span>
              <Badge variant="outline" className="capitalize">
                {localUser.preferences.primaryGoal}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Lift Records */}
        <Card
          className="cursor-pointer hover:border-primary transition-colors"
          onClick={() => navigate('/lift-records')}
        >
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏆</span>
                <div>
                  <p className="font-medium">Lift Records</p>
                  <p className="text-xs text-muted-foreground">
                    Track your personal records
                  </p>
                </div>
              </div>
              <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </CardContent>
        </Card>

        {/* Training Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Training Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Days per Week</span>
                <span className="font-medium">{localUser.preferences.trainingDaysPerWeek}</span>
              </div>
              <div className="flex gap-2">
                {([3, 4, 5, 6] as const).map((days) => (
                  <button
                    key={days}
                    onClick={() => handleUpdatePreference('trainingDaysPerWeek', days)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm transition-colors',
                      localUser.preferences.trainingDaysPerWeek === days
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {days}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Session Duration</span>
                <span className="font-medium">{localUser.preferences.sessionDurationMinutes}m</span>
              </div>
              <div className="flex gap-2">
                {([45, 60, 75, 90] as const).map((duration) => (
                  <button
                    key={duration}
                    onClick={() => handleUpdatePreference('sessionDurationMinutes', duration)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm transition-colors',
                      localUser.preferences.sessionDurationMinutes === duration
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {duration}m
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Weight Unit</span>
                <span className="font-medium">{localUser.preferences.weightUnit}</span>
              </div>
              <div className="flex gap-2">
                {(['lbs', 'kg'] as const).map((unit) => (
                  <button
                    key={unit}
                    onClick={() => handleUpdatePreference('weightUnit', unit)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm transition-colors',
                      localUser.preferences.weightUnit === unit
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {unit.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Coaching</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">API Key Status</span>
              {localUser.apiKey ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Badge variant="outline">Not Set</Badge>
              )}
            </div>

            {localUser.apiKey && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Key</span>
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="text-sm text-primary hover:underline"
                >
                  {showApiKey ? localUser.apiKey.slice(0, 20) + '...' : 'Show'}
                </button>
              </div>
            )}

            <div className="space-y-2">
              <Input
                type="password"
                placeholder="sk-ant-api..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                hint="Enter a new API key to update"
              />
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleSaveApiKey}
                loading={isSaving}
                disabled={!apiKey}
              >
                {localUser.apiKey ? 'Update API Key' : 'Save API Key'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Injury Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Injury Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(localUser.injuryProfile)
              .filter(([key]) => key !== 'other')
              .map(([key, status]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <Badge
                    variant={
                      (status as { severity: number }).severity > 5
                        ? 'destructive'
                        : (status as { severity: number }).severity > 0
                        ? 'warning'
                        : 'secondary'
                    }
                  >
                    {(status as { severity: number }).severity === 0
                      ? 'None'
                      : `${(status as { severity: number }).severity}/10`}
                  </Badge>
                </div>
              ))}
            <p className="text-xs text-muted-foreground">
              Injury settings affect exercise selection and programming. Update these when your status changes.
            </p>
          </CardContent>
        </Card>

        {/* Feedback & Rest Timer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback & Rest Timer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <ToggleRow
              label="Haptic feedback"
              hint="Vibrate on set completion and timer end"
              checked={settings?.hapticFeedback ?? true}
              onChange={(v) => handleToggleSetting('hapticFeedback', v)}
            />
            <ToggleRow
              label="Rest timer"
              hint="Auto-start a countdown after each set"
              checked={settings?.restTimerEnabled ?? true}
              onChange={(v) => handleToggleSetting('restTimerEnabled', v)}
            />
            <ToggleRow
              label="Timer sound"
              hint="Chime when the rest timer ends"
              checked={settings?.restTimerSound ?? true}
              onChange={(v) => handleToggleSetting('restTimerSound', v)}
            />

            <div className="pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Default rest</span>
                <span className="font-medium">{settings?.defaultRestTime ?? 90}s</span>
              </div>
              <div className="flex gap-2">
                {([60, 90, 120, 180] as const).map((sec) => (
                  <button
                    key={sec}
                    onClick={() => handleToggleSetting('defaultRestTime', sec)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm transition-colors',
                      (settings?.defaultRestTime ?? 90) === sec
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full" onClick={handleExport}>
              Export Data
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button variant="outline" className="w-full" onClick={() => importInputRef.current?.click()}>
              Import / Restore
            </Button>
            {importError && (
              <p className="text-xs text-destructive text-center">{importError}</p>
            )}
            <Button variant="destructive" className="w-full" onClick={handleReset}>
              Reset All Data
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Data is stored locally on your device. Export regularly to backup — importing replaces your current data.
            </p>
          </CardContent>
        </Card>

        {/* App Info */}
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-sm font-medium tracking-wider">FORGE</p>
            <p className="text-xs text-muted-foreground">Version 0.1.0</p>
            <p className="text-xs text-muted-foreground mt-2">
              Every rep shapes who you become.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-secondary'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </button>
    </div>
  )
}
