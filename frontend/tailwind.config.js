/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#04050a',
        surface:  '#090c14',
        surface2: '#0d1120',
        border:   '#141d2f',
        border2:  '#1f2e45',
        intel:    '#f0b429',
        'intel-dim': '#7a5010',
        muted:    '#546480',
        dim:      '#8899b2',
        text:     '#e2eaf5',
        crisis: {
          war:          '#f85149',
          conflict:     '#ff9f7e',
          economic:     '#d29922',
          supply:       '#a371f7',
          natural:      '#39c5cf',
          health:       '#3fb950',
          political:    '#f0883e',
          food:         '#7ee787',
          energy:       '#ffa657',
          climate:      '#79c0ff',
          humanitarian: '#ff7b72',
        },
        sev: {
          critical:   '#f85149',
          high:       '#f0883e',
          medium:     '#d29922',
          low:        '#3fb950',
          monitoring: '#7d8590',
        },
      },
      fontFamily: {
        sans:    ['"IBM Plex Mono"', '"Courier New"', 'monospace'],
        display: ['Rajdhani', 'Impact', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-up':    'fade-in-up 0.35s ease both',
        'alert':      'alert-blink 0.9s step-end infinite',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
