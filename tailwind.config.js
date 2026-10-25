/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: ['pixel-cut', 'pixel-cut-badge', 'hud-bracket-box', 'timeline-axis', 'bg-gradient-sbs', 'font-handjet'],
  theme: {
    extend: {
      colors: {
        sbs: {
          black: '#0F0F0F',
          dark: '#2A2E30',
          light: '#BCC1C4',
          white: '#F7F7F7',
          sky: '#2D89CA',
          storm: '#0D1A35',
          dawn: '#C2EEFB',
        },
        tactical: {
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
        },
      },
      fontFamily: {
        bebas: ['"Bebas Neue"', 'sans-serif'],
        handjet: ['Handjet', 'monospace'],
        fixel: ['"Fixel Text"', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-sbs': 'linear-gradient(to top, #2D89CA, #0D1A35)',
      },
    },
  },
  plugins: [],
}
