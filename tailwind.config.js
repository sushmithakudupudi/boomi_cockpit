/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        boomi: {
          blue: '#0072CE',
          dark: '#0B1B3D',
          navy: '#061024',
          accent: '#00B2FE',
          card: '#111E38',
          cardBorder: '#1E2D4D',
          hover: '#192C55',
        }
      },
      animation: {
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 178, 254, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 178, 254, 0.6)' },
        }
      }
    },
  },
  plugins: [],
}
