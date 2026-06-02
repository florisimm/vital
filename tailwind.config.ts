import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Rounded', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '30px',
      },
    },
  },
  plugins: [],
}

export default config
