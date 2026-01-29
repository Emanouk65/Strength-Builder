import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/db'
import { Button, Card, CardContent, Input, Slider, Badge } from '@/components/ui'
import { cn, generateId } from '@/lib/utils'
import { PHASE_CONFIG } from '@/lib/constants'
import type {
  User,
  UserPreferences,
  InjuryProfile,
  InjuryStatus,
  PhaseType,
  BiologicalProfile,
  FitnessProfile,
  Gender,
  ActivityLevel,
  TrainingBackground,
  TrainingType,
  PrimaryMotivation,
  SecondaryGoal,
  LifestyleFactors,
  MuscleGroup,
  EquipmentAccess,
  ExperienceLevel,
} from '@/lib/types'

// ============================================================================
// Onboarding Data Types
// ============================================================================

interface OnboardingData {
  // Step 1: Identity
  name: string
  // Step 2: Body metrics
  gender: Gender
  dateOfBirth: string
  height: string
  weight: string
  heightUnit: 'cm' | 'ft_in'
  weightUnit: 'kg' | 'lbs'
  // Step 3: Fitness background
  activityLevel: ActivityLevel
  trainingBackground: TrainingBackground
  yearsTraining: number
  previousTrainingTypes: TrainingType[]
  currentFitnessRating: number
  // Step 4: Goals
  primaryMotivation: PrimaryMotivation
  secondaryGoals: SecondaryGoal[]
  targetAreas: MuscleGroup[]
  // Step 5: Lifestyle
  sleepQuality: 'poor' | 'fair' | 'good' | 'excellent'
  averageSleepHours: number
  stressLevel: 'low' | 'moderate' | 'high' | 'very_high'
  occupation: 'sedentary' | 'light_activity' | 'moderate_activity' | 'physical_labor'
  // Step 6: Schedule
  trainingDaysPerWeek: 3 | 4 | 5 | 6
  preferredDays: number[]
  sessionDurationMinutes: 45 | 60 | 75 | 90
  // Step 7: Equipment
  equipmentAccess: EquipmentAccess
  // Step 8: Injuries
  injuries: {
    achilles: number
    knees: number
    lowerBack: number
    shoulders: number
    elbows: number
    hips: number
    wrists: number
  }
  // Step 9: Phase
  initialPhase: PhaseType
  // Step 10: API
  apiKey: string
}

const defaultData: OnboardingData = {
  name: '',
  gender: 'prefer_not_to_say',
  dateOfBirth: '',
  height: '',
  weight: '',
  heightUnit: 'ft_in',
  weightUnit: 'lbs',
  activityLevel: 'moderate',
  trainingBackground: 'consistent',
  yearsTraining: 2,
  previousTrainingTypes: [],
  currentFitnessRating: 5,
  primaryMotivation: 'build_muscle',
  secondaryGoals: [],
  targetAreas: [],
  sleepQuality: 'good',
  averageSleepHours: 7,
  stressLevel: 'moderate',
  occupation: 'sedentary',
  trainingDaysPerWeek: 4,
  preferredDays: [1, 2, 4, 5],
  sessionDurationMinutes: 60,
  equipmentAccess: 'full_gym',
  injuries: {
    achilles: 0,
    knees: 0,
    lowerBack: 0,
    shoulders: 0,
    elbows: 0,
    hips: 0,
    wrists: 0,
  },
  initialPhase: 'base',
  apiKey: '',
}

const TOTAL_STEPS = 10

// ============================================================================
// Main Onboarding Component
// ============================================================================

export function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<OnboardingData>(defaultData)
  const [isCreating, setIsCreating] = useState(false)

  const nextStep = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  const prevStep = () => setStep((s) => Math.max(s - 1, 0))

  const createUser = async () => {
    setIsCreating(true)
    try {
      const injuryProfile: InjuryProfile = {
        achilles: createInjuryStatus(data.injuries.achilles),
        knees: createInjuryStatus(data.injuries.knees),
        lowerBack: createInjuryStatus(data.injuries.lowerBack),
        shoulders: createInjuryStatus(data.injuries.shoulders),
        elbows: createInjuryStatus(data.injuries.elbows),
        other: [],
      }

      const experienceLevel: ExperienceLevel =
        data.yearsTraining < 1 ? 'beginner' :
        data.yearsTraining < 3 ? 'intermediate' :
        data.yearsTraining < 6 ? 'advanced' : 'elite'

      const preferences: UserPreferences = {
        trainingDaysPerWeek: data.trainingDaysPerWeek,
        preferredDays: data.preferredDays,
        sessionDurationMinutes: data.sessionDurationMinutes,
        primaryGoal: mapMotivationToGoal(data.primaryMotivation),
        experienceLevel,
        equipmentAccess: data.equipmentAccess,
        peakDate: null,
        weightUnit: data.weightUnit === 'lbs' ? 'lbs' : 'kg',
      }

      const biologicalProfile: BiologicalProfile = {
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        height: data.height ? convertToMetric(data.height, data.heightUnit, 'height') : null,
        weight: data.weight ? convertToMetric(data.weight, data.weightUnit, 'weight') : null,
        bodyFatPercentage: null,
        heightUnit: data.heightUnit,
        weightUnit: data.weightUnit,
      }

      const lifestyle: LifestyleFactors = {
        sleepQuality: data.sleepQuality,
        averageSleepHours: data.averageSleepHours,
        stressLevel: data.stressLevel,
        occupation: data.occupation,
        dietFocus: 'none',
      }

      const fitnessProfile: FitnessProfile = {
        activityLevel: data.activityLevel,
        trainingBackground: data.trainingBackground,
        yearsTraining: data.yearsTraining,
        previousTrainingTypes: data.previousTrainingTypes,
        currentFitnessRating: data.currentFitnessRating,
        primaryMotivation: data.primaryMotivation,
        secondaryGoals: data.secondaryGoals,
        targetAreas: data.targetAreas,
        lifestyle,
      }

      const user: User = {
        id: generateId(),
        name: data.name,
        createdAt: new Date(),
        preferences,
        injuryProfile,
        currentPhaseId: null,
        apiKey: data.apiKey || null,
        biologicalProfile,
        fitnessProfile,
        currentStreak: 0,
        longestStreak: 0,
        lastWorkoutDate: null,
        totalWorkoutsCompleted: 0,
      }

      await db.users.add(user)
      navigate('/')
    } catch (error) {
      console.error('Failed to create user:', error)
      setIsCreating(false)
    }
  }

  const renderStep = () => {
    const props = { data, setData, nextStep, prevStep }
    switch (step) {
      case 0: return <WelcomeStep onStart={nextStep} />
      case 1: return <IdentityStep {...props} />
      case 2: return <BodyMetricsStep {...props} />
      case 3: return <FitnessBackgroundStep {...props} />
      case 4: return <GoalsStep {...props} />
      case 5: return <LifestyleStep {...props} />
      case 6: return <ScheduleStep {...props} />
      case 7: return <EquipmentStep {...props} />
      case 8: return <InjuryStep {...props} />
      case 9: return <FinalStep {...props} onComplete={createUser} isCreating={isCreating} />
      default: return null
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Progress Bar */}
      {step > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/50">
          <div className="safe-area-inset">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Step {step} of {TOTAL_STEPS - 1}
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.round((step / (TOTAL_STEPS - 1)) * 100)}%
                </span>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out"
                  style={{ width: `${(step / (TOTAL_STEPS - 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={cn(
        "px-5 pb-8 safe-area-inset",
        step > 0 ? "pt-20" : "pt-4"
      )}>
        {renderStep()}
      </div>
    </div>
  )
}

// ============================================================================
// Step Components
// ============================================================================

// Step 0: Welcome
function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[90vh] text-center px-2">
      {/* Logo */}
      <div className="mb-10">
        <div className="relative">
          <h1 className="text-6xl font-black tracking-tight text-foreground">
            FORGE
          </h1>
          <div className="absolute -inset-4 bg-primary/20 blur-2xl rounded-full -z-10" />
        </div>
        <p className="text-lg text-muted-foreground mt-3 font-medium">
          Intelligent Strength Training
        </p>
      </div>

      {/* Value Props */}
      <div className="w-full max-w-sm space-y-4 mb-10">
        <FeatureItem
          icon="chart"
          title="AI-Powered Programming"
          description="Adaptive workouts that evolve with you"
        />
        <FeatureItem
          icon="target"
          title="Personalized Plans"
          description="Built around your goals, schedule, and body"
        />
        <FeatureItem
          icon="trophy"
          title="Track Progress"
          description="PRs, streaks, and achievements"
        />
      </div>

      {/* CTA */}
      <div className="w-full max-w-sm space-y-3">
        <Button
          className="w-full h-14 text-base font-semibold shadow-glow"
          onClick={onStart}
        >
          Start Assessment
        </Button>
        <p className="text-xs text-muted-foreground">
          2 minutes to complete
        </p>
      </div>
    </div>
  )
}

function FeatureItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  const icons: Record<string, string> = {
    chart: 'M3 3v18h18',
    target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
    trophy: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6',
  }

  return (
    <div className="flex items-start gap-4 text-left p-4 rounded-2xl bg-card/50 border border-border/50">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <div className="w-5 h-5 text-primary">
          {icon === 'chart' && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M18 17V9" />
              <path d="M13 17V5" />
              <path d="M8 17v-3" />
            </svg>
          )}
          {icon === 'target' && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          )}
          {icon === 'trophy' && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          )}
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// Step 1: Identity
function IdentityStep({ data, setData, nextStep, prevStep }: StepProps) {
  return (
    <div className="max-w-md mx-auto">
      <StepHeader
        title="Let's get acquainted"
        subtitle="What should we call you?"
      />

      <div className="space-y-6">
        <div>
          <Input
            placeholder="Your name"
            value={data.name}
            onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
            autoFocus
            className="h-14 text-lg bg-card border-border/50 rounded-2xl"
          />
        </div>

        <NavigationButtons
          onBack={prevStep}
          onNext={nextStep}
          nextDisabled={!data.name.trim()}
        />
      </div>
    </div>
  )
}

// Step 2: Body Metrics
function BodyMetricsStep({ data, setData, nextStep, prevStep }: StepProps) {
  const genderOptions: { value: Gender; label: string; icon: string }[] = [
    { value: 'male', label: 'Male', icon: 'M' },
    { value: 'female', label: 'Female', icon: 'F' },
    { value: 'other', label: 'Other', icon: 'O' },
    { value: 'prefer_not_to_say', label: 'Skip', icon: '-' },
  ]

  const getAge = (dob: string): number | null => {
    if (!dob) return null
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
    return age
  }

  const age = getAge(data.dateOfBirth)

  return (
    <div className="max-w-md mx-auto">
      <StepHeader
        title="Body metrics"
        subtitle="Helps us personalize your training intensity and recovery"
      />

      <div className="space-y-6">
        {/* Gender */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-3">
            Gender
          </label>
          <div className="grid grid-cols-4 gap-2">
            {genderOptions.map((option) => (
              <OptionButton
                key={option.value}
                selected={data.gender === option.value}
                onClick={() => setData((d) => ({ ...d, gender: option.value }))}
              >
                {option.label}
              </OptionButton>
            ))}
          </div>
        </div>

        {/* Date of Birth */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-3">
            Date of Birth
          </label>
          <Input
            type="date"
            value={data.dateOfBirth}
            onChange={(e) => setData((d) => ({ ...d, dateOfBirth: e.target.value }))}
            max={new Date().toISOString().split('T')[0]}
            className="h-14 bg-card border-border/50 rounded-2xl"
          />
          {age !== null && (
            <p className="text-sm text-primary mt-2 font-medium">{age} years old</p>
          )}
        </div>

        {/* Height */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Height
            </label>
            <UnitToggle
              options={[
                { value: 'ft_in', label: 'ft' },
                { value: 'cm', label: 'cm' },
              ]}
              value={data.heightUnit}
              onChange={(v) => setData((d) => ({ ...d, heightUnit: v as 'cm' | 'ft_in', height: '' }))}
            />
          </div>
          {data.heightUnit === 'cm' ? (
            <Input
              type="number"
              placeholder="175"
              value={data.height}
              onChange={(e) => setData((d) => ({ ...d, height: e.target.value }))}
              className="h-14 bg-card border-border/50 rounded-2xl text-lg"
            />
          ) : (
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Input
                  type="number"
                  placeholder="5"
                  value={data.height ? Math.floor(parseFloat(data.height) / 12).toString() : ''}
                  onChange={(e) => {
                    const feet = parseInt(e.target.value) || 0
                    const inches = data.height ? parseFloat(data.height) % 12 : 0
                    setData((d) => ({ ...d, height: (feet * 12 + inches).toString() }))
                  }}
                  className="h-14 bg-card border-border/50 rounded-2xl text-lg pr-10"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">ft</span>
              </div>
              <div className="flex-1 relative">
                <Input
                  type="number"
                  placeholder="10"
                  value={data.height ? Math.round(parseFloat(data.height) % 12).toString() : ''}
                  onChange={(e) => {
                    const inches = parseInt(e.target.value) || 0
                    const feet = data.height ? Math.floor(parseFloat(data.height) / 12) : 0
                    setData((d) => ({ ...d, height: (feet * 12 + inches).toString() }))
                  }}
                  className="h-14 bg-card border-border/50 rounded-2xl text-lg pr-10"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">in</span>
              </div>
            </div>
          )}
        </div>

        {/* Weight */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Weight
            </label>
            <UnitToggle
              options={[
                { value: 'lbs', label: 'lbs' },
                { value: 'kg', label: 'kg' },
              ]}
              value={data.weightUnit}
              onChange={(v) => setData((d) => ({ ...d, weightUnit: v as 'kg' | 'lbs', weight: '' }))}
            />
          </div>
          <div className="relative">
            <Input
              type="number"
              placeholder={data.weightUnit === 'kg' ? '75' : '165'}
              value={data.weight}
              onChange={(e) => setData((d) => ({ ...d, weight: e.target.value }))}
              className="h-14 bg-card border-border/50 rounded-2xl text-lg pr-14"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
              {data.weightUnit}
            </span>
          </div>
        </div>

        <NavigationButtons onBack={prevStep} onNext={nextStep} />
      </div>
    </div>
  )
}

// Step 3: Fitness Background
function FitnessBackgroundStep({ data, setData, nextStep, prevStep }: StepProps) {
  const activityLevels: { value: ActivityLevel; label: string; description: string }[] = [
    { value: 'sedentary', label: 'Sedentary', description: 'Mostly sitting' },
    { value: 'light', label: 'Light', description: 'Walking, light activity' },
    { value: 'moderate', label: 'Moderate', description: 'Regular movement' },
    { value: 'active', label: 'Active', description: 'Daily exercise' },
    { value: 'very_active', label: 'Very Active', description: 'Intense daily activity' },
  ]

  const trainingTypes: { value: TrainingType; label: string }[] = [
    { value: 'strength_training', label: 'Strength Training' },
    { value: 'bodybuilding', label: 'Bodybuilding' },
    { value: 'powerlifting', label: 'Powerlifting' },
    { value: 'crossfit', label: 'CrossFit' },
    { value: 'calisthenics', label: 'Calisthenics' },
    { value: 'running', label: 'Running' },
    { value: 'sports', label: 'Sports' },
    { value: 'yoga', label: 'Yoga' },
  ]

  const toggleTrainingType = (type: TrainingType) => {
    setData((d) => ({
      ...d,
      previousTrainingTypes: d.previousTrainingTypes.includes(type)
        ? d.previousTrainingTypes.filter((t) => t !== type)
        : [...d.previousTrainingTypes, type],
    }))
  }

  return (
    <div className="max-w-md mx-auto">
      <StepHeader
        title="Your fitness background"
        subtitle="Understanding where you're starting from"
      />

      <div className="space-y-8">
        {/* Years Training */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-4">
            Years of Training Experience
          </label>
          <div className="flex items-center gap-4">
            <span className="text-4xl font-bold text-foreground font-mono w-16">
              {data.yearsTraining}
            </span>
            <div className="flex-1">
              <Slider
                min={0}
                max={15}
                value={data.yearsTraining}
                onChange={(v) => setData((d) => ({ ...d, yearsTraining: v }))}
                showValue={false}
              />
            </div>
            <span className="text-sm text-muted-foreground w-12">
              {data.yearsTraining === 15 ? '15+' : 'years'}
            </span>
          </div>
        </div>

        {/* Activity Level */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-3">
            Daily Activity Level
          </label>
          <div className="grid grid-cols-1 gap-2">
            {activityLevels.map((level) => (
              <OptionButton
                key={level.value}
                selected={data.activityLevel === level.value}
                onClick={() => setData((d) => ({ ...d, activityLevel: level.value }))}
                className="justify-between"
              >
                <span className="font-medium">{level.label}</span>
                <span className="text-sm text-muted-foreground">{level.description}</span>
              </OptionButton>
            ))}
          </div>
        </div>

        {/* Previous Training */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-3">
            Previous Training Experience
          </label>
          <div className="flex flex-wrap gap-2">
            {trainingTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => toggleTrainingType(type.value)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all',
                  data.previousTrainingTypes.includes(type.value)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                )}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Current Fitness Rating */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-4">
            Current Fitness Level
          </label>
          <div className="flex items-center gap-4">
            <span className="text-4xl font-bold text-primary font-mono w-12">
              {data.currentFitnessRating}
            </span>
            <div className="flex-1">
              <Slider
                min={1}
                max={10}
                value={data.currentFitnessRating}
                onChange={(v) => setData((d) => ({ ...d, currentFitnessRating: v }))}
                showValue={false}
              />
            </div>
            <span className="text-sm text-muted-foreground w-16 text-right">
              {data.currentFitnessRating <= 3 ? 'Beginner' :
               data.currentFitnessRating <= 6 ? 'Moderate' :
               data.currentFitnessRating <= 8 ? 'Fit' : 'Elite'}
            </span>
          </div>
        </div>

        <NavigationButtons onBack={prevStep} onNext={nextStep} />
      </div>
    </div>
  )
}

// Step 4: Goals
function GoalsStep({ data, setData, nextStep, prevStep }: StepProps) {
  const motivations: { value: PrimaryMotivation; label: string; icon: string }[] = [
    { value: 'build_muscle', label: 'Build Muscle', icon: 'muscle' },
    { value: 'get_stronger', label: 'Get Stronger', icon: 'strength' },
    { value: 'lose_fat', label: 'Lose Fat', icon: 'fire' },
    { value: 'improve_health', label: 'Improve Health', icon: 'heart' },
    { value: 'athletic_performance', label: 'Athletic Performance', icon: 'bolt' },
    { value: 'look_better', label: 'Look Better', icon: 'star' },
  ]

  const targetAreas: { value: MuscleGroup; label: string }[] = [
    { value: 'chest', label: 'Chest' },
    { value: 'back', label: 'Back' },
    { value: 'shoulders', label: 'Shoulders' },
    { value: 'biceps', label: 'Arms' },
    { value: 'quads', label: 'Legs' },
    { value: 'glutes', label: 'Glutes' },
    { value: 'core', label: 'Core' },
  ]

  const toggleTarget = (area: MuscleGroup) => {
    setData((d) => ({
      ...d,
      targetAreas: d.targetAreas.includes(area)
        ? d.targetAreas.filter((a) => a !== area)
        : [...d.targetAreas, area],
    }))
  }

  return (
    <div className="max-w-md mx-auto">
      <StepHeader
        title="What's your main goal?"
        subtitle="We'll optimize your program around this"
      />

      <div className="space-y-8">
        {/* Primary Motivation */}
        <div className="grid grid-cols-2 gap-3">
          {motivations.map((m) => (
            <OptionButton
              key={m.value}
              selected={data.primaryMotivation === m.value}
              onClick={() => setData((d) => ({ ...d, primaryMotivation: m.value }))}
              className="flex-col items-center py-6"
            >
              <span className="text-2xl mb-2">
                {m.icon === 'muscle' && '💪'}
                {m.icon === 'strength' && '🏋️'}
                {m.icon === 'fire' && '🔥'}
                {m.icon === 'heart' && '❤️'}
                {m.icon === 'bolt' && '⚡'}
                {m.icon === 'star' && '✨'}
              </span>
              <span className="font-medium text-sm">{m.label}</span>
            </OptionButton>
          ))}
        </div>

        {/* Target Areas */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-3">
            Areas to Focus On <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {targetAreas.map((area) => (
              <button
                key={area.value}
                onClick={() => toggleTarget(area.value)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all',
                  data.targetAreas.includes(area.value)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                )}
              >
                {area.label}
              </button>
            ))}
          </div>
        </div>

        <NavigationButtons onBack={prevStep} onNext={nextStep} />
      </div>
    </div>
  )
}

// Step 5: Lifestyle
function LifestyleStep({ data, setData, nextStep, prevStep }: StepProps) {
  const sleepOptions = [
    { value: 'poor' as const, label: 'Poor', description: '<5 hrs' },
    { value: 'fair' as const, label: 'Fair', description: '5-6 hrs' },
    { value: 'good' as const, label: 'Good', description: '7-8 hrs' },
    { value: 'excellent' as const, label: 'Great', description: '8+ hrs' },
  ]

  const stressOptions = [
    { value: 'low' as const, label: 'Low' },
    { value: 'moderate' as const, label: 'Moderate' },
    { value: 'high' as const, label: 'High' },
    { value: 'very_high' as const, label: 'Very High' },
  ]

  return (
    <div className="max-w-md mx-auto">
      <StepHeader
        title="Lifestyle factors"
        subtitle="Recovery is just as important as training"
      />

      <div className="space-y-8">
        {/* Sleep Quality */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-3">
            Sleep Quality
          </label>
          <div className="grid grid-cols-4 gap-2">
            {sleepOptions.map((opt) => (
              <OptionButton
                key={opt.value}
                selected={data.sleepQuality === opt.value}
                onClick={() => setData((d) => ({ ...d, sleepQuality: opt.value }))}
                className="flex-col py-4"
              >
                <span className="font-medium text-sm">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </OptionButton>
            ))}
          </div>
        </div>

        {/* Average Sleep */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-4">
            Average Hours of Sleep
          </label>
          <div className="flex items-center gap-4">
            <span className="text-4xl font-bold text-foreground font-mono w-12">
              {data.averageSleepHours}
            </span>
            <div className="flex-1">
              <Slider
                min={4}
                max={10}
                value={data.averageSleepHours}
                onChange={(v) => setData((d) => ({ ...d, averageSleepHours: v }))}
                showValue={false}
              />
            </div>
            <span className="text-sm text-muted-foreground">hrs/night</span>
          </div>
        </div>

        {/* Stress Level */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-3">
            Current Stress Level
          </label>
          <div className="grid grid-cols-4 gap-2">
            {stressOptions.map((opt) => (
              <OptionButton
                key={opt.value}
                selected={data.stressLevel === opt.value}
                onClick={() => setData((d) => ({ ...d, stressLevel: opt.value }))}
              >
                <span className="font-medium text-sm">{opt.label}</span>
              </OptionButton>
            ))}
          </div>
        </div>

        <NavigationButtons onBack={prevStep} onNext={nextStep} />
      </div>
    </div>
  )
}

// Step 6: Schedule
function ScheduleStep({ data, setData, nextStep, prevStep }: StepProps) {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const toggleDay = (index: number) => {
    setData((d) => {
      const newDays = d.preferredDays.includes(index)
        ? d.preferredDays.filter((day) => day !== index)
        : [...d.preferredDays, index].sort()
      return {
        ...d,
        preferredDays: newDays,
        trainingDaysPerWeek: Math.min(Math.max(newDays.length, 3), 6) as 3 | 4 | 5 | 6,
      }
    })
  }

  const durations = [45, 60, 75, 90] as const

  return (
    <div className="max-w-md mx-auto">
      <StepHeader
        title="Training schedule"
        subtitle="When can you commit to training?"
      />

      <div className="space-y-8">
        {/* Days */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-4">
            Training Days
          </label>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day, index) => (
              <button
                key={index}
                onClick={() => toggleDay(index)}
                className={cn(
                  'aspect-square rounded-2xl text-base font-semibold transition-all flex flex-col items-center justify-center',
                  data.preferredDays.includes(index)
                    ? 'bg-primary text-primary-foreground shadow-glow-sm'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                )}
              >
                <span>{day}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-center mt-3">
            <span className="text-primary font-semibold">{data.preferredDays.length}</span>
            <span className="text-muted-foreground"> days per week</span>
          </p>
        </div>

        {/* Session Duration */}
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-3">
            Session Duration
          </label>
          <div className="grid grid-cols-4 gap-2">
            {durations.map((duration) => (
              <OptionButton
                key={duration}
                selected={data.sessionDurationMinutes === duration}
                onClick={() => setData((d) => ({ ...d, sessionDurationMinutes: duration }))}
                className="py-4"
              >
                <span className="text-xl font-bold">{duration}</span>
                <span className="text-xs text-muted-foreground">min</span>
              </OptionButton>
            ))}
          </div>
        </div>

        <NavigationButtons
          onBack={prevStep}
          onNext={nextStep}
          nextDisabled={data.preferredDays.length < 3}
        />
      </div>
    </div>
  )
}

// Step 7: Equipment
function EquipmentStep({ data, setData, nextStep, prevStep }: StepProps) {
  const options: { value: EquipmentAccess; label: string; description: string; icon: string }[] = [
    {
      value: 'full_gym',
      label: 'Full Gym',
      description: 'Commercial gym with all equipment',
      icon: '🏋️',
    },
    {
      value: 'home_barbell',
      label: 'Home Gym (Barbell)',
      description: 'Barbell, rack, bench, plates',
      icon: '🏠',
    },
    {
      value: 'home_dumbbells',
      label: 'Home Gym (Dumbbells)',
      description: 'Dumbbells and basic equipment',
      icon: '💪',
    },
    {
      value: 'minimal',
      label: 'Minimal',
      description: 'Bodyweight + resistance bands',
      icon: '🧘',
    },
  ]

  return (
    <div className="max-w-md mx-auto">
      <StepHeader
        title="Equipment access"
        subtitle="What do you have available?"
      />

      <div className="space-y-3">
        {options.map((opt) => (
          <OptionButton
            key={opt.value}
            selected={data.equipmentAccess === opt.value}
            onClick={() => setData((d) => ({ ...d, equipmentAccess: opt.value }))}
            className="w-full"
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">{opt.icon}</span>
              <div className="text-left">
                <span className="font-semibold block">{opt.label}</span>
                <span className="text-sm text-muted-foreground">{opt.description}</span>
              </div>
            </div>
          </OptionButton>
        ))}
      </div>

      <div className="mt-8">
        <NavigationButtons onBack={prevStep} onNext={nextStep} />
      </div>
    </div>
  )
}

// Step 8: Injuries
function InjuryStep({ data, setData, nextStep, prevStep }: StepProps) {
  const areas: { key: keyof typeof data.injuries; label: string }[] = [
    { key: 'shoulders', label: 'Shoulders' },
    { key: 'elbows', label: 'Elbows' },
    { key: 'wrists', label: 'Wrists' },
    { key: 'lowerBack', label: 'Lower Back' },
    { key: 'hips', label: 'Hips' },
    { key: 'knees', label: 'Knees' },
    { key: 'achilles', label: 'Ankles/Achilles' },
  ]

  const hasInjuries = Object.values(data.injuries).some((v) => v > 0)

  return (
    <div className="max-w-md mx-auto">
      <StepHeader
        title="Any limitations?"
        subtitle="We'll program around these to keep you safe"
      />

      <div className="space-y-5">
        {areas.map((area) => (
          <div key={area.key}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{area.label}</span>
              <span className={cn(
                'text-sm font-mono font-bold px-2 py-0.5 rounded',
                data.injuries[area.key] === 0 ? 'text-muted-foreground' :
                data.injuries[area.key] <= 3 ? 'text-success' :
                data.injuries[area.key] <= 6 ? 'text-warning' : 'text-destructive'
              )}>
                {data.injuries[area.key] === 0 ? 'None' : data.injuries[area.key]}
              </span>
            </div>
            <Slider
              min={0}
              max={10}
              value={data.injuries[area.key]}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  injuries: { ...d.injuries, [area.key]: v },
                }))
              }
              showValue={false}
            />
          </div>
        ))}
      </div>

      {hasInjuries && (
        <div className="mt-6 p-4 rounded-2xl bg-warning/10 border border-warning/20">
          <p className="text-sm text-warning">
            We'll modify exercises to work around your limitations.
          </p>
        </div>
      )}

      <div className="mt-8">
        <NavigationButtons onBack={prevStep} onNext={nextStep} />
      </div>
    </div>
  )
}

// Step 9: Final
function FinalStep({
  data,
  prevStep,
  onComplete,
  isCreating,
}: StepProps & { onComplete: () => void; isCreating: boolean }) {
  const getSummary = () => {
    const experienceLevel =
      data.yearsTraining < 1 ? 'Beginner' :
      data.yearsTraining < 3 ? 'Intermediate' :
      data.yearsTraining < 6 ? 'Advanced' : 'Elite'

    return {
      experience: experienceLevel,
      days: data.preferredDays.length,
      duration: data.sessionDurationMinutes,
      goal: data.primaryMotivation.replace(/_/g, ' '),
    }
  }

  const summary = getSummary()

  return (
    <div className="max-w-md mx-auto">
      <StepHeader
        title={`Ready to forge, ${data.name.split(' ')[0]}?`}
        subtitle="Here's your personalized profile"
      />

      {/* Summary Card */}
      <Card className="mb-6 bg-gradient-to-br from-card to-card/50 border-border/50">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4">
            <SummaryItem label="Experience" value={summary.experience} />
            <SummaryItem label="Training Days" value={`${summary.days}/week`} />
            <SummaryItem label="Session Length" value={`${summary.duration} min`} />
            <SummaryItem label="Primary Goal" value={summary.goal} className="capitalize" />
          </div>
        </CardContent>
      </Card>

      {/* AI Coaching (Optional) */}
      <div className="space-y-4 mb-8">
        <div>
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-2">
            AI Coaching <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <Input
            type="password"
            placeholder="Claude API Key"
            value={data.apiKey}
            onChange={(e) => setData((d) => ({ ...d, apiKey: e.target.value }))}
            className="h-14 bg-card border-border/50 rounded-2xl"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Add later in settings if you don't have one
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <Button
          className="w-full h-14 text-base font-semibold shadow-glow"
          onClick={onComplete}
          loading={isCreating}
        >
          Start Training
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={prevStep}
        >
          Go Back
        </Button>
      </div>
    </div>
  )
}

function SummaryItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-lg font-semibold text-foreground mt-1", className)}>{value}</p>
    </div>
  )
}

// ============================================================================
// Shared Components
// ============================================================================

interface StepProps {
  data: OnboardingData
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>
  nextStep: () => void
  prevStep: () => void
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-foreground">{title}</h2>
      <p className="text-muted-foreground mt-1">{subtitle}</p>
    </div>
  )
}

function OptionButton({
  children,
  selected,
  onClick,
  className,
}: {
  children: React.ReactNode
  selected: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border-2 p-4 text-center transition-all duration-200 touch-target flex items-center',
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/50 bg-card text-muted-foreground hover:border-border hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}

function UnitToggle({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex bg-secondary rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-md transition-all',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function NavigationButtons({
  onBack,
  onNext,
  nextDisabled = false,
  nextLabel = 'Continue',
}: {
  onBack: () => void
  onNext: () => void
  nextDisabled?: boolean
  nextLabel?: string
}) {
  return (
    <div className="flex gap-3 pt-4">
      <Button
        variant="outline"
        className="flex-1 h-14 rounded-2xl"
        onClick={onBack}
      >
        Back
      </Button>
      <Button
        className="flex-1 h-14 rounded-2xl font-semibold"
        onClick={onNext}
        disabled={nextDisabled}
      >
        {nextLabel}
      </Button>
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function createInjuryStatus(severity: number): InjuryStatus {
  return {
    severity,
    isActive: severity > 0,
    lastFlareUp: severity > 0 ? new Date() : null,
    notes: '',
    restrictions: [],
  }
}

function mapMotivationToGoal(motivation: PrimaryMotivation): 'strength' | 'hypertrophy' | 'conditioning' | 'hybrid' {
  switch (motivation) {
    case 'get_stronger':
    case 'athletic_performance':
      return 'strength'
    case 'build_muscle':
    case 'look_better':
      return 'hypertrophy'
    case 'lose_fat':
    case 'boost_energy':
      return 'conditioning'
    default:
      return 'hybrid'
  }
}

function convertToMetric(value: string, unit: string, type: 'height' | 'weight'): number {
  const numValue = parseFloat(value)
  if (isNaN(numValue)) return 0

  if (type === 'height') {
    // Height: ft_in stores total inches, cm stores cm
    return unit === 'cm' ? numValue : numValue * 2.54
  } else {
    // Weight: lbs to kg
    return unit === 'kg' ? numValue : numValue * 0.453592
  }
}
