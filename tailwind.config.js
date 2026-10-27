/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        viking: {
          blue: '#132436',
          'blue-light': '#1d3a54',
          'blue-deep': '#0c1826',
          gold: '#DBC067',
          red: '#72121C',
          white: '#FFFFFF'
        }
      },
      fontFamily: {
        display: ['"Archivo Black"', 'Arial Black', 'sans-serif'],
        body: ['Montserrat', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: []
}
