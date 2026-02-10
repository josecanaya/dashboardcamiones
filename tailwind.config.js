/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: { 50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5', 300: '#d4d4d4' },
        primary: { 500: '#2563eb', 600: '#1d4ed8', 100: '#dbeafe', 200: '#bfdbfe' },
        success: { 100: '#dcfce7', 500: '#22c55e' },
        warning: { 100: '#fef3c7', 500: '#f59e0b' },
        anomaly: { 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626' },
      },
    },
  },
  plugins: [],
}
