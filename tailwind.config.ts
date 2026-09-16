import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf5f0',
          100: '#f8e5d8',
          300: '#e4a56f',
          500: '#c46a2f', // warm terracotta-adjacent but tuned toward silk/dye tones
          700: '#8f4a1e',
          900: '#4a2610',
        },
        ink: '#211a15',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
    },
  },
  plugins: [],
};

export default config;
