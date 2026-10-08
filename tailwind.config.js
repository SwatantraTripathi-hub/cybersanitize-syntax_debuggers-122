/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        atlas: {
          navy: '#001E2B',        // Atlas Dark Slate Navy (Sidebar)
          navydark: '#00141E',    // Deepest navy
          forest: '#00684A',      // MongoDB Forest Green (Primary action)
          foresthover: '#023430', // Forest Green hover
          green: '#00ED64',       // Atlas Electric Lime / Spring Green
          lightgreen: '#E8F8F0',  // Badge background
          bordergreen: '#C1EAD5', // Badge border
          bg: '#F9FBFA',          // Main body background (clean crisp light)
          card: '#FFFFFF',        // Card background
          border: '#E8EDEB',      // Card border
          borderhover: '#D0DDD8', // Border hover
          text: '#1C2D38',        // High-contrast primary text
          muted: '#5C6C75',       // Secondary muted text
          lightmuted: '#89979F',  // Placeholder text
          danger: '#C93B2B',      // Destructive action
          dangerbg: '#FDEDEC',
          warning: '#996600',
          warningbg: '#FEF8E7',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'atlas': '0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'atlas-hover': '0 4px 12px 0 rgba(0, 30, 43, 0.08), 0 2px 4px 0 rgba(0, 30, 43, 0.04)',
      }
    },
  },
  plugins: [],
}
