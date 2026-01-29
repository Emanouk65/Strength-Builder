/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Premium athletic dark theme - inspired by Apple Fitness, Whoop, Linear
        background: '#0a0a0b',        // Deep charcoal, near-black
        foreground: '#fafafa',        // Off-white primary text
        card: '#141416',              // Slightly elevated surface
        'card-foreground': '#fafafa',
        // Primary accent - Electric cyan (used sparingly)
        primary: '#06b6d4',
        'primary-foreground': '#0a0a0b',
        // Secondary surfaces
        secondary: '#1c1c1f',
        'secondary-foreground': '#fafafa',
        muted: '#1c1c1f',
        'muted-foreground': '#71717a',  // Muted gray for labels
        // Accent colors for achievements and highlights
        accent: '#06b6d4',
        'accent-foreground': '#0a0a0b',
        // Achievement colors
        'achievement': '#f97316',       // Orange for PRs and achievements
        'achievement-alt': '#a855f7',   // Purple for special achievements
        'streak': '#22d3ee',            // Cyan for streaks
        // Semantic colors
        destructive: '#ef4444',
        'destructive-foreground': '#fafafa',
        success: '#10b981',             // Emerald green
        warning: '#f59e0b',             // Amber
        // Borders and inputs
        border: '#27272a',
        input: '#1c1c1f',
        ring: '#06b6d4',
        // RPE training states
        'rpe-low': '#10b981',           // Emerald - easy
        'rpe-moderate': '#f59e0b',      // Amber - moderate
        'rpe-high': '#f97316',          // Orange - hard
        'rpe-max': '#ef4444',           // Red - maximal
        'pain-signal': '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Large metric numbers
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
        'glow': '0 0 20px rgba(6, 182, 212, 0.3)',
        'glow-sm': '0 0 10px rgba(6, 182, 212, 0.2)',
        'achievement': '0 0 20px rgba(249, 115, 22, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(6, 182, 212, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)' },
        },
      },
    },
  },
  plugins: [],
}
