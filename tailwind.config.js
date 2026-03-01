/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Premium dark theme – deep charcoal / midnight
        background: '#0D0D0D',
        foreground: '#FFFFFF',
        card: '#1A1A2E',
        'card-foreground': '#FFFFFF',
        // Electric blue primary
        primary: '#4361EE',
        'primary-foreground': '#FFFFFF',
        // Secondary surfaces
        secondary: '#252540',
        'secondary-foreground': '#FFFFFF',
        muted: '#1E1E3A',
        'muted-foreground': '#8E8E93',
        // Accent
        accent: '#4361EE',
        'accent-foreground': '#FFFFFF',
        // Extended accent palette
        'accent-green': '#00F5D4',
        'accent-orange': '#FF6B35',
        'accent-purple': '#7209B7',
        // Achievement / highlights
        achievement: '#FF6B35',
        'achievement-alt': '#7209B7',
        streak: '#4361EE',
        // Semantic
        destructive: '#FF453A',
        'destructive-foreground': '#FFFFFF',
        success: '#00C853',
        warning: '#FF6B35',
        // Borders / inputs
        border: '#2A2A4A',
        input: '#1E1E3A',
        ring: '#4361EE',
        // RPE training states
        'rpe-low': '#00C853',
        'rpe-moderate': '#FFB300',
        'rpe-high': '#FF6B35',
        'rpe-max': '#FF453A',
        'pain-signal': '#FF453A',
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
        'glow': '0 0 20px rgba(67, 97, 238, 0.45)',
        'glow-sm': '0 0 10px rgba(67, 97, 238, 0.25)',
        'glow-green': '0 0 16px rgba(0, 245, 212, 0.35)',
        'glow-success': '0 0 12px rgba(0, 200, 83, 0.4)',
        'achievement': '0 0 20px rgba(255, 107, 53, 0.45)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.5)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.65)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(67, 97, 238, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(67, 97, 238, 0.55)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
}
