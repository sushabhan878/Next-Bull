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
        trading: {
          bg: 'var(--trading-bg)',
          panel: 'var(--trading-panel)',
          border: 'var(--trading-border)',
          green: 'var(--trading-green)',
          red: 'var(--trading-red)',
        }
      }
    },
  },
  plugins: [],
}
