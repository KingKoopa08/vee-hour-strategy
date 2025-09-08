/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'trading-dark': '#0a0a0a',
        'trading-gray': '#1a1a1a',
        'trading-green': '#00ff88',
        'trading-red': '#ff3366',
        'trading-yellow': '#ffcc00',
        'trading-blue': '#3366ff',
        'vwap': '#ff00ff',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgb(0, 255, 136, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgb(0, 255, 136, 0.8), 0 0 40px rgb(0, 255, 136, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}