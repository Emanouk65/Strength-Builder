/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Monochrome dark theme — pure black/white with subtle grays
        background: '#000000',
        foreground: '#FFFFFF',
        card: '#0F0F0F',
        'card-foreground': '#FFFFFF',
        // Primary = white (used for CTAs and active states)
        primary: '#FFFFFF',
        'primary-foreground': '#000000',
        // Secondary surfaces (subtle steps of gray)
        secondary: '#1A1A1A',
        'secondary-foreground': '#FFFFFF',
        muted: '#141414',
        'muted-foreground': '#8A8A8A',
        // Accent (kept = white for monochrome)
        accent: '#FFFFFF',
        'accent-foreground': '#000000',
        // Extended accents — kept for legacy refs, all unified to white/grays
        'accent-green': '#FFFFFF',
        'accent-orange': '#FFFFFF',
        'accent-purple': '#FFFFFF',
        // Achievement / highlights
        achievement: '#FFFFFF',
        'achievement-alt': '#A0A0A0',
        streak: '#FFFFFF',
        // Semantic — red kept for destructive (universal danger signal)
        destructive: '#EF4444',
        'destructive-foreground': '#FFFFFF',
        success: '#FFFFFF',
        warning: '#FBBF24',
        // Borders / inputs
        border: '#262626',
        input: '#141414',
        ring: '#FFFFFF',
        // RPE training states — graded grayscale + red for max
        'rpe-low': '#A0A0A0',
        'rpe-moderate': '#C0C0C0',
        'rpe-high': '#E0E0E0',
        'rpe-max': '#EF4444',
        'pain-signal': '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'metric-xl': ['3.5rem', { lineHeight: '1', fontWeight: '700' }],
        'metric-lg': ['2.5rem', { lineHeight: '1', fontWeight: '700' }],
        'metric-md': ['1.75rem', { lineHeight: '1', fontWeight: '600' }],
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'glow': '0 0 0 1px rgba(255, 255, 255, 0.12), 0 8px 28px rgba(0, 0, 0, 0.55)',
        'glow-sm': '0 0 0 1px rgba(255, 255, 255, 0.08), 0 4px 16px rgba(0, 0, 0, 0.45)',
        'glow-green': '0 0 0 1px rgba(255, 255, 255, 0.12), 0 8px 28px rgba(0, 0, 0, 0.55)',
        'glow-success': '0 0 0 1px rgba(255, 255, 255, 0.18), 0 4px 16px rgba(0, 0, 0, 0.45)',
        'achievement': '0 0 0 1px rgba(255, 255, 255, 0.18), 0 8px 28px rgba(0, 0, 0, 0.55)',
        'card': '0 1px 0 0 rgba(255, 255, 255, 0.04) inset, 0 4px 24px rgba(0, 0, 0, 0.5)',
        'card-hover': '0 1px 0 0 rgba(255, 255, 255, 0.08) inset, 0 8px 32px rgba(0, 0, 0, 0.65)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%':   { boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.08)' },
          '100%': { boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.22)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
}
