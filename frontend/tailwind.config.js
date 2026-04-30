/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070708",
          900: "#0b0b0d",
          850: "#101013",
          800: "#16161b",
          700: "#1d1e24",
          600: "#2a2b33",
          500: "#3a3c46",
        },
        bone: {
          50: "#f5f1e8",
          100: "#e8e3d4",
          200: "#c9c2ae",
          300: "#9a9483",
          400: "#6b6657",
        },
        signal: {
          DEFAULT: "#ffb547",
          bright: "#ffcd6b",
          dim: "#a37224",
          deep: "#5a3d12",
        },
        veridian: "#4ad295",
        coral: "#ff6b6b",
        violet: "#a78bfa",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        display: ['"Instrument Serif"', "ui-serif", "serif"],
      },
      letterSpacing: {
        widest2: "0.32em",
      },
    },
  },
  plugins: [],
};
