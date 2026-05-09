/** @type {import('tailwindcss').Config} */
// Tailwind is wired up per the project plan, but the bulk of the design
// uses semantic CSS classes driven by CSS custom properties (in styles.css).
// Tailwind utilities are available for ad-hoc layout where they're cleaner
// than reaching for a new class.
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Map Tailwind names to the CSS variables defined in styles.css so
        // utility classes like `bg-bg-primary` follow the active theme.
        'bg-primary':     'var(--bg-primary)',
        'bg-secondary':   'var(--bg-secondary)',
        'bg-tertiary':    'var(--bg-tertiary)',
        'bg-elevated':    'var(--bg-elevated)',
        'border-subtle':  'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        'border-strong':  'var(--border-strong)',
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary':  'var(--text-tertiary)',
        'accent':         'var(--accent)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
