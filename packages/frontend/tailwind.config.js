/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          900: '#14532d',
        },
        dark: {
          50:  '#f8fafc',
          100: '#0f1117',
          200: '#161b22',
          300: '#1c2128',
          400: '#22272e',
          500: '#2d333b',
          600: '#373e47',
          700: '#444c56',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in':    'fadeIn 200ms ease-out',
        'slide-up':   'slideUp 300ms ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },                          to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
