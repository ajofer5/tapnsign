import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#F2F2F4',
          black: '#111111',
          navy: '#001B5C',
          blue: '#FA0909',
          violet: '#6722F7',
          gold: '#F1C168',
          ink: '#1F2430',
          mist: '#EEF1F7',
        },
      },
      fontFamily: {
        sans: [
          'Optima',
          '"Palatino Linotype"',
          '"Book Antiqua"',
          'Palatino',
          '"Times New Roman"',
          'serif',
        ],
        serif: [
          'Optima',
          '"Palatino Linotype"',
          '"Book Antiqua"',
          'Palatino',
          '"Times New Roman"',
          'serif',
        ],
        ui: [
          'Optima',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
