/** @type {import('tailwindcss').Config} */
export default {
  // Bật dark mode bằng class => điều khiển qua config/theme.ts
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette thương hiệu — tuỳ biến theo design system của dự án
        primary: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          light: '#3b82f6',
          dark: '#1e40af',
        },
        secondary: {
          DEFAULT: '#64748b',
          hover: '#475569',
        },
        danger: {
          DEFAULT: '#dc2626',
          hover: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
