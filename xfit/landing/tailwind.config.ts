import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F2B3C',
        accent: '#14B8A6',
        accentDark: '#0E9385',
        mist: '#E0F7F5',
        slate1: '#5A6B7B',
        slate2: '#94A3B8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Cal Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 40px -12px rgba(15, 43, 60, 0.18)',
        glow: '0 0 0 4px rgba(20, 184, 166, 0.15)',
      },
    },
  },
  plugins: [],
};

export default config;
