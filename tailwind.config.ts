import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Linear-inspired color palette
        primary: {
          DEFAULT: '#0D9488',
          light: '#14B8A6',
          dark: '#0F766E',
        },
        accent: '#5EEAD4',
        surface: {
          DEFAULT: '#0D0D0D',
          light: '#1A1A1A',
          lighter: '#2A2A2A',
        },
      },
      animation: {
        // Bounces 5 times 1s equals 5 seconds
        "ping-short": "ping 1s ease-in-out 5",
        "slide-up": "slideUp 0.8s ease-out forwards",
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "float": "float 6s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite",
        "pulse-slow": "pulse 3s ease-in-out infinite",
      },
      keyframes: {
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(13, 148, 136, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(13, 148, 136, 0.5)" },
        },
      },
      screens: {
        betterhover: { raw: "(hover: hover)" },
      },
      transitionProperty: {
        height: "height",
        width: "width",
      },
      dropShadow: {
        glowBlue: [
          "0px 0px 2px #000",
          "0px 0px 4px #000",
          "0px 0px 30px #0141ff",
          "0px 0px 100px #0141ff80",
        ],
        glowRed: [
          "0px 0px 2px #f00",
          "0px 0px 4px #000",
          "0px 0px 15px #ff000040",
          "0px 0px 30px #f00",
          "0px 0px 100px #ff000080",
        ],
        glowTeal: [
          "0px 0px 2px #000",
          "0px 0px 4px #000",
          "0px 0px 30px #0D9488",
          "0px 0px 100px #0D948880",
        ],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gradient-mesh": 
          "radial-gradient(at 40% 20%, rgba(13, 148, 136, 0.15) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(20, 184, 166, 0.1) 0px, transparent 50%)",
      },
      fontFamily: {
        favorit: ["var(--font-favorit)"],
        inter: ["Inter", "Arial", "sans serif"],
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(13, 148, 136, 0.3)',
        'glow': '0 0 20px rgba(13, 148, 136, 0.4)',
        'glow-lg': '0 0 40px rgba(13, 148, 136, 0.5)',
      },
    },
  },
};
export default config;
