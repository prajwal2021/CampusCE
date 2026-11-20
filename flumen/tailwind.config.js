/** @type {import('tailwindcss').Config} */
// Every colour comes from a CSS variable (see app/globals.css), so the light and dark themes
// switch the whole app by changing data-theme on <html>.
const v = name => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        surface: { 0: v('surface-0'), 1: v('surface-1'), 2: v('surface-2'), 3: v('surface-3'), 4: v('surface-4') },
        accent: { DEFAULT: v('accent'), hover: v('accent-hover'), muted: v('accent-muted'), fg: v('accent-fg') },
        nav: { DEFAULT: v('nav'), fg: v('nav-fg'), muted: v('nav-muted'), line: v('nav-line'), accent: v('nav-accent') },
        zinc: {
          100: v('ink-100'), 200: v('ink-200'), 300: v('ink-300'), 400: v('ink-400'),
          500: v('ink-500'), 600: v('ink-600'), 700: v('ink-700'),
        },
        red: { 300: v('red-300'), 400: v('red-400') },
        emerald: { 400: v('green-400') },
        amber: { 400: v('amber-400') },
        blue: { 400: v('blue-400') },
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [],
};
