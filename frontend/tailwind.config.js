/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 needs to scan every file that uses className.
  content: ['./src/**/*.{ts,tsx}', './App.tsx'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Keep these tokens in sync with src/config/theme.ts.
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          light: '#60a5fa',
          dark: '#1d4ed8',
        },
        secondary: {
          DEFAULT: '#7c3aed',
          light: '#a78bfa',
          dark: '#5b21b6',
        },
        success: '#16a34a',
        danger: '#dc2626',
        warning: '#f59e0b',
        muted: '#6b7280',
        background: '#f9fafb',
        surface: '#ffffff',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
