import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0f1117',
          800: '#161922',
          700: '#1e2130',
          600: '#282c3e',
        },
        accent: {
          DEFAULT: '#06b6d4',
          dim: '#0e7490',
          glow: 'rgba(6, 182, 212, 0.15)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
