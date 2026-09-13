import type { Exercise, MuscleGroup } from './types'

// ============================================================================
// Mobility content — dynamic warmup drills + cooldown stretches
// ============================================================================
// A small curated library (all descriptions original). Selection is
// deterministic per workout (seeded by workoutId) so the list is stable
// across reloads mid-session.

export type MobilityKind = 'dynamic_warmup' | 'stretch'

export interface MobilityDrill {
  id: string
  name: string
  kind: MobilityKind
  /** Muscle groups this drill preps/releases. 'full_body' marks general drills. */
  targets: MuscleGroup[]
  /** Reps prescription, e.g. "10/side", "8 slow". Mutually exclusive with duration. */
  reps?: string
  /** Hold/work duration in seconds (stretches, timed drills). */
  durationSeconds?: number
  /** One short original coaching cue. */
  cue: string
}

export const MOBILITY_LIBRARY: MobilityDrill[] = [
  // --- Dynamic warmup drills -----------------------------------------------
  { id: 'jumping-jacks', name: 'Jumping Jacks', kind: 'dynamic_warmup', targets: ['full_body'], durationSeconds: 45, cue: 'Light and springy — just get the blood moving.' },
  { id: 'high-knees', name: 'High Knees', kind: 'dynamic_warmup', targets: ['full_body', 'quads'], durationSeconds: 30, cue: 'Quick feet, tall chest, drive the knees up.' },
  { id: 'butt-kicks', name: 'Butt Kicks', kind: 'dynamic_warmup', targets: ['hamstrings', 'quads'], durationSeconds: 30, cue: 'Heels to glutes at an easy jog rhythm.' },
  { id: 'arm-circles', name: 'Arm Circles', kind: 'dynamic_warmup', targets: ['shoulders'], reps: '10 each way', cue: 'Start small, grow the circles as the shoulders loosen.' },
  { id: 'band-pull-aparts', name: 'Band Pull-Aparts', kind: 'dynamic_warmup', targets: ['shoulders', 'back'], reps: '15', cue: 'Squeeze the shoulder blades together at the end.' },
  { id: 'band-pass-throughs', name: 'Band Pass-Throughs', kind: 'dynamic_warmup', targets: ['shoulders', 'chest'], reps: '10 slow', cue: 'Wide grip, arms straight, over and back without arching.' },
  { id: 'scap-push-ups', name: 'Scap Push-Ups', kind: 'dynamic_warmup', targets: ['shoulders', 'chest'], reps: '8 slow', cue: 'Arms locked — only the shoulder blades move.' },
  { id: 'wall-slides', name: 'Wall Slides', kind: 'dynamic_warmup', targets: ['shoulders'], reps: '8', cue: 'Keep wrists and elbows glued to the wall as you slide up.' },
  { id: 'easy-push-ups', name: 'Easy Push-Ups', kind: 'dynamic_warmup', targets: ['chest', 'triceps'], reps: '10 easy', cue: 'Half effort — priming, not training.' },
  { id: 'cat-cow', name: 'Cat-Cow', kind: 'dynamic_warmup', targets: ['back', 'core'], reps: '8 slow', cue: 'Move one vertebra at a time, breathe with it.' },
  { id: 'band-rows', name: 'Band Rows', kind: 'dynamic_warmup', targets: ['back', 'biceps'], reps: '15', cue: 'Elbows tight, pause a beat at the chest.' },
  { id: 'dead-hang', name: 'Dead Hang', kind: 'dynamic_warmup', targets: ['back', 'forearms', 'shoulders'], durationSeconds: 20, cue: 'Relax and let the lats and shoulders decompress.' },
  { id: 'worlds-greatest-stretch', name: "World's Greatest Stretch", kind: 'dynamic_warmup', targets: ['hamstrings', 'glutes', 'core', 'quads'], reps: '5/side', cue: 'Deep lunge, rotate and reach for the ceiling.' },
  { id: 'leg-swings-front', name: 'Leg Swings (front-back)', kind: 'dynamic_warmup', targets: ['hamstrings', 'glutes'], reps: '10/side', cue: 'Hold something for balance, swing loose and tall.' },
  { id: 'leg-swings-side', name: 'Leg Swings (side-side)', kind: 'dynamic_warmup', targets: ['glutes', 'quads'], reps: '10/side', cue: 'Open the hips — swing across and out.' },
  { id: 'bodyweight-squats', name: 'Bodyweight Squats', kind: 'dynamic_warmup', targets: ['quads', 'glutes'], reps: '12', cue: 'Full depth, easy tempo, knees tracking the toes.' },
  { id: 'walking-lunges-easy', name: 'Walking Lunges', kind: 'dynamic_warmup', targets: ['quads', 'glutes', 'hamstrings'], reps: '8/side', cue: 'Long steps, torso tall, soft landings.' },
  { id: 'glute-bridges', name: 'Glute Bridges', kind: 'dynamic_warmup', targets: ['glutes', 'hamstrings'], reps: '12', cue: 'Drive through the heels, squeeze at the top.' },
  { id: 'hip-circles', name: 'Hip Circles', kind: 'dynamic_warmup', targets: ['glutes'], reps: '8 each way', cue: 'Hands on hips, draw big smooth circles.' },
  { id: 'ankle-circles', name: 'Ankle Circles', kind: 'dynamic_warmup', targets: ['calves'], reps: '8 each way', cue: 'Slow full circles — ankles set the base for everything.' },
  { id: 'calf-pumps', name: 'Calf Pumps', kind: 'dynamic_warmup', targets: ['calves'], reps: '15', cue: 'Rise tall on the toes, drop slow.' },
  { id: 'bird-dogs', name: 'Bird Dogs', kind: 'dynamic_warmup', targets: ['core', 'back', 'glutes'], reps: '8/side', cue: 'Opposite arm and leg, hips level, no wobble.' },
  { id: 'dead-bugs', name: 'Dead Bugs', kind: 'dynamic_warmup', targets: ['core'], reps: '8/side', cue: 'Low back pressed to the floor the whole time.' },
  { id: 'inchworms', name: 'Inchworms', kind: 'dynamic_warmup', targets: ['hamstrings', 'core', 'shoulders'], reps: '6', cue: 'Walk out to a plank, walk back with soft knees.' },
  { id: 'torso-twists', name: 'Torso Twists', kind: 'dynamic_warmup', targets: ['core'], reps: '10/side', cue: 'Relaxed arms, rotate from the trunk.' },
  { id: 'plank-to-downdog', name: 'Plank to Down-Dog', kind: 'dynamic_warmup', targets: ['core', 'shoulders', 'hamstrings', 'calves'], reps: '8', cue: 'Push the floor away, heels reach down each rep.' },
  { id: 'wrist-circles', name: 'Wrist Circles', kind: 'dynamic_warmup', targets: ['forearms'], reps: '10 each way', cue: 'Loosen the wrists before anything heavy hits your hands.' },

  // --- Cooldown stretches ---------------------------------------------------
  { id: 'couch-stretch', name: 'Couch Stretch', kind: 'stretch', targets: ['quads'], durationSeconds: 40, cue: 'Rear foot up on a bench, squeeze the glute, stay tall. Per side.' },
  { id: 'standing-quad-stretch', name: 'Standing Quad Stretch', kind: 'stretch', targets: ['quads'], durationSeconds: 30, cue: 'Knees together, heel to glute, gentle pull. Per side.' },
  { id: 'hamstring-fold', name: 'Standing Hamstring Fold', kind: 'stretch', targets: ['hamstrings'], durationSeconds: 40, cue: 'Hinge at the hips, soft knees, let the arms hang heavy.' },
  { id: 'seated-hamstring-stretch', name: 'Seated Hamstring Stretch', kind: 'stretch', targets: ['hamstrings'], durationSeconds: 30, cue: 'Reach toward the toes with a long spine, not a rounded one. Per side.' },
  { id: 'figure-4-stretch', name: 'Figure-4 Stretch', kind: 'stretch', targets: ['glutes'], durationSeconds: 30, cue: 'Ankle over knee, pull the legs in until the glute talks. Per side.' },
  { id: 'pigeon-pose', name: 'Pigeon Pose', kind: 'stretch', targets: ['glutes'], durationSeconds: 45, cue: 'Front shin across, sink the hips square and breathe. Per side.' },
  { id: 'butterfly-stretch', name: 'Butterfly Stretch', kind: 'stretch', targets: ['glutes', 'quads'], durationSeconds: 40, cue: 'Soles together, let the knees fall with gravity.' },
  { id: 'hip-flexor-stretch', name: 'Kneeling Hip Flexor Stretch', kind: 'stretch', targets: ['quads', 'core'], durationSeconds: 30, cue: 'Tuck the pelvis, shift forward gently. Per side.' },
  { id: 'calf-wall-stretch', name: 'Calf Wall Stretch', kind: 'stretch', targets: ['calves'], durationSeconds: 30, cue: 'Back leg straight, heel pinned to the floor. Per side.' },
  { id: 'doorway-pec-stretch', name: 'Doorway Pec Stretch', kind: 'stretch', targets: ['chest', 'shoulders'], durationSeconds: 30, cue: 'Forearm on the frame, step through until the chest opens. Per side.' },
  { id: 'cross-body-shoulder-stretch', name: 'Cross-Body Shoulder Stretch', kind: 'stretch', targets: ['shoulders'], durationSeconds: 30, cue: 'Pull the arm across, shoulder down away from the ear. Per side.' },
  { id: 'overhead-triceps-stretch', name: 'Overhead Triceps Stretch', kind: 'stretch', targets: ['triceps'], durationSeconds: 30, cue: 'Elbow to the sky, hand down the spine. Per side.' },
  { id: 'lat-hang', name: 'Lat Hang', kind: 'stretch', targets: ['back'], durationSeconds: 30, cue: 'Grab a bar or rack, sit the hips back and let the lats lengthen.' },
  { id: 'childs-pose', name: "Child's Pose", kind: 'stretch', targets: ['back', 'shoulders'], durationSeconds: 45, cue: 'Knees wide, arms long, forehead down, slow breaths.' },
  { id: 'cobra-stretch', name: 'Cobra Stretch', kind: 'stretch', targets: ['core'], durationSeconds: 30, cue: 'Hips stay down, press the chest up only as far as comfortable.' },
  { id: 'seated-spinal-twist', name: 'Seated Spinal Twist', kind: 'stretch', targets: ['back', 'core'], durationSeconds: 30, cue: 'Sit tall first, then rotate — height before twist. Per side.' },
  { id: 'knees-to-chest', name: 'Knees to Chest', kind: 'stretch', targets: ['back', 'glutes'], durationSeconds: 30, cue: 'On your back, hug both knees and rock gently.' },
  { id: 'downward-dog', name: 'Downward Dog', kind: 'stretch', targets: ['hamstrings', 'calves', 'shoulders'], durationSeconds: 40, cue: 'Hips high, pedal the heels one at a time.' },
  { id: 'forearm-flexor-stretch', name: 'Forearm Flexor Stretch', kind: 'stretch', targets: ['forearms', 'biceps'], durationSeconds: 20, cue: 'Arm straight, palm up, gently pull the fingers back. Per side.' },
  { id: 'biceps-wall-stretch', name: 'Biceps Wall Stretch', kind: 'stretch', targets: ['biceps', 'chest'], durationSeconds: 25, cue: 'Palm flat on the wall behind you, turn away slowly. Per side.' },
  { id: 'standing-side-bend', name: 'Standing Side Bend', kind: 'stretch', targets: ['core', 'back'], durationSeconds: 20, cue: 'Reach up and over, keep both feet grounded. Per side.' },
  { id: 'neck-side-stretch', name: 'Neck Side Stretch', kind: 'stretch', targets: ['shoulders'], durationSeconds: 20, cue: 'Ear toward shoulder, opposite arm reaches down. Per side.' },
]

// ----------------------------------------------------------------------------
// Deterministic selection
// ----------------------------------------------------------------------------

/** Small stable string hash for seeded tie-breaking. */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Muscles trained by the day's exercises (cardio counts as general). */
function targetMuscles(exercises: (Partial<Exercise> | undefined)[]): Set<MuscleGroup> {
  const muscles = new Set<MuscleGroup>()
  for (const ex of exercises) {
    for (const m of ex?.primaryMuscles ?? []) {
      if (m !== 'cardio_system') muscles.add(m)
    }
  }
  return muscles
}

/**
 * Greedy coverage pick: repeatedly choose the drill that covers the most
 * still-uncovered target muscles, ties broken by seeded hash so the list is
 * stable per workout but varies between workouts.
 */
function pickDrills(
  kind: MobilityKind,
  muscles: Set<MuscleGroup>,
  seed: string,
  count: number
): MobilityDrill[] {
  const pool = MOBILITY_LIBRARY.filter(d => d.kind === kind)
  const picked: MobilityDrill[] = []
  const covered = new Set<MuscleGroup>()

  // Warmups always open with one general full-body drill.
  if (kind === 'dynamic_warmup') {
    const generals = pool.filter(d => d.targets.includes('full_body'))
    generals.sort((a, b) => hashString(seed + a.id) - hashString(seed + b.id))
    if (generals[0]) picked.push(generals[0])
  }

  while (picked.length < count) {
    let best: MobilityDrill | null = null
    let bestScore = -1
    for (const d of pool) {
      if (picked.includes(d)) continue
      const relevant = d.targets.filter(t => muscles.has(t))
      if (relevant.length === 0) continue
      const fresh = relevant.filter(t => !covered.has(t)).length
      // Prefer new coverage; among equals, prefer more relevance; then seed.
      const score = fresh * 1000 + relevant.length * 10
      const tie = best ? hashString(seed + d.id) < hashString(seed + best.id) : true
      if (score > bestScore || (score === bestScore && tie)) {
        best = d
        bestScore = score
      }
    }
    if (!best || bestScore <= 0) break
    picked.push(best)
    best.targets.forEach(t => covered.add(t))
    // Stop early once everything is covered and we have a reasonable list.
    if (picked.length >= 3 && [...muscles].every(m => covered.has(m))) break
  }

  // Cardio-only or empty days: pad with sensible generals.
  if (picked.length < 3) {
    const padIds = kind === 'dynamic_warmup'
      ? ['jumping-jacks', 'bodyweight-squats', 'arm-circles', 'cat-cow']
      : ['hamstring-fold', 'childs-pose', 'calf-wall-stretch', 'figure-4-stretch']
    for (const id of padIds) {
      if (picked.length >= 3) break
      const d = MOBILITY_LIBRARY.find(x => x.id === id)
      if (d && !picked.includes(d)) picked.push(d)
    }
  }

  return picked
}

/**
 * 4-6 dynamic drills prepping the day's muscles (always includes one general
 * pulse-raiser). Deterministic per seed (use the workoutId).
 */
export function getWarmupDrills(
  exercises: (Partial<Exercise> | undefined)[],
  seed: string
): MobilityDrill[] {
  return pickDrills('dynamic_warmup', targetMuscles(exercises), seed, 6)
}

/**
 * 3-5 cooldown stretches releasing the muscles just trained. Deterministic
 * per seed (use the workoutId).
 */
export function getCooldownStretches(
  exercises: (Partial<Exercise> | undefined)[],
  seed: string
): MobilityDrill[] {
  return pickDrills('stretch', targetMuscles(exercises), seed, 5)
}
