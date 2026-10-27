import colors from 'tailwindcss/colors'
import plugin from 'tailwindcss/plugin'

/*
 * Light / dark theming.
 * Every palette colour is a CSS variable, so the existing utility classes (bg-slate-900,
 * text-sky-300, ...) re-colour themselves when <html> has the `light` class:
 *   - neutrals invert (dark surfaces become light, light text becomes dark)
 *   - accent tints used for text on dark (100-400) map to deeper shades for contrast on white
 *   - `white` becomes near-black text, except inside solid coloured surfaces (buttons, badges)
 */
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const NEUTRALS = ['slate', 'gray', 'zinc', 'neutral', 'stone']
const ACCENTS = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const LIGHT_NEUTRAL = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 }
const LIGHT_ACCENT = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 600, 700: 700, 800: 200, 900: 100, 950: 50 }

const BOOMI = {
  //         dark        light
  blue:       ['#0072CE', '#0072CE'],
  dark:       ['#0B1B3D', '#FFFFFF'],
  navy:       ['#061024', '#F3F6FB'],
  accent:     ['#00B2FE', '#0284C7'],
  card:       ['#111E38', '#FFFFFF'],
  cardBorder: ['#1E2D4D', '#DBE3EF'],
  hover:      ['#192C55', '#E8F0FB'],
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}
const ref = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

const palette = {}
for (const fam of [...NEUTRALS, ...ACCENTS]) {
  palette[fam] = Object.fromEntries(SHADES.map((s) => [s, ref(`${fam}-${s}`)]))
}

const darkVars = { '--c-white': '255 255 255' }
const lightVars = { '--c-white': rgb(colors.slate[900]) }
for (const fam of [...NEUTRALS, ...ACCENTS]) {
  const map = NEUTRALS.includes(fam) ? LIGHT_NEUTRAL : LIGHT_ACCENT
  for (const s of SHADES) {
    darkVars[`--c-${fam}-${s}`] = rgb(colors[fam][s])
    lightVars[`--c-${fam}-${s}`] = rgb(colors[fam][map[s]])
  }
}
// On solid coloured surfaces (buttons, badges) light text and pale icon tints keep their dark-theme values,
// otherwise light mode would turn e.g. a text-amber-200 icon on a blue button dark and unreadable.
const solidVars = { '--c-white': '255 255 255' }
for (const fam of ACCENTS) {
  for (const s of [50, 100, 200, 300, 400]) solidVars[`--c-${fam}-${s}`] = rgb(colors[fam][s])
}
for (const [k, [d, l]] of Object.entries(BOOMI)) {
  darkVars[`--c-boomi-${k}`] = rgb(d)
  lightVars[`--c-boomi-${k}`] = rgb(l)
}

// Solid, saturated surfaces keep white text in light mode.
// Tinted gradients (translucent stops, fades to transparent, neutral surfaces) are not solid.
const solid = [
  '[class*="bg-gradient-to-"]:not([class*="-950/"]):not([class*="to-transparent"]):not([class*="from-slate-"])',
  '[class~="bg-boomi-blue"]',
  ...ACCENTS.flatMap((f) => [500, 600, 700].map((s) => `[class~="bg-${f}-${s}"]`)),
].join(',')

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
        ...palette,
        white: ref('white'),
        boomi: Object.fromEntries(Object.keys(BOOMI).map((k) => [k, ref(`boomi-${k}`)])),
      },
      screens: {
        xs: '480px',
      },
      // One typeface family for the whole app (both are loaded in index.html).
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
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
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': { ...darkVars, colorScheme: 'dark' },
        'html.light': { ...lightVars, colorScheme: 'light' },
        [`html.light :is(${solid})`]: solidVars,
      })
    }),
  ],
}
