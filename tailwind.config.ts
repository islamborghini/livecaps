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
        // Existing LiveCaps palette (KEEP - referenced throughout the app)
        primary: {
          DEFAULT: '#0D9488',
          light: '#14B8A6',
          dark: '#0F766E',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#5EEAD4',
          foreground: '#0D0D0D',
        },
        surface: {
          DEFAULT: '#0D0D0D',
          light: '#1A1A1A',
          lighter: '#2A2A2A',
        },
        // shadcn system colors (CSS variable based)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        // Bounces 5 times 1s equals 5 seconds
        "ping-short": "ping 1s ease-in-out 5",
        "slide-up": "slideUp 0.8s ease-out forwards",
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "float": "float 6s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
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
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
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
  plugins: [require("tailwindcss-animate")],
};
export default config;
