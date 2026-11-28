import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

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
  plugins: [
    // `touch:` styles for screens without hover (phones, tablets): edit buttons always visible,
    // 44 px targets.
    plugin(({ addVariant }) => addVariant('touch', '@media (hover: none)')),
  ],
} satisfies Config;
