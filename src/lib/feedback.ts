// ============================================================================
// Haptic + audio feedback — small, dependency-free helpers gated by user
// settings. All no-ops when the capability is unavailable or the toggle is off.
// ============================================================================

/** Vibrate if haptics are enabled and the device supports it. */
export function triggerHaptic(enabled: boolean, pattern: number | number[] = 20): void {
  if (!enabled) return
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    // Some browsers throw if called outside a user gesture — ignore.
  }
}

// Lazily created shared AudioContext (created on first use inside a gesture).
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!audioCtx) audioCtx = new Ctor()
    return audioCtx
  } catch {
    return null
  }
}

/**
 * Play a short two-note chime. Uses the WebAudio API so there's no asset to
 * bundle or load. No-op when disabled or unsupported.
 */
export function playChime(enabled: boolean): void {
  if (!enabled) return
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    const notes = [
      { freq: 660, start: 0, dur: 0.14 },
      { freq: 880, start: 0.13, dur: 0.22 },
    ]
    for (const n of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = n.freq
      gain.gain.setValueAtTime(0.0001, now + n.start)
      gain.gain.exponentialRampToValueAtTime(0.25, now + n.start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + n.start)
      osc.stop(now + n.start + n.dur)
    }
  } catch {
    // Autoplay / gesture restrictions — safe to ignore.
  }
}
