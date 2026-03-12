import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Core brand colors
        primary: {
          50: "#f0f4ff",
          100: "#dbe4ff",
          200: "#bac8ff",
          300: "#91a7ff",
          400: "#748ffc",
          500: "#5c7cfa",
          600: "#4c6ef5",
          700: "#4263eb",
          800: "#3b5bdb",
          900: "#364fc7",
        },
        // Dark theme surfaces
        surface: {
          50: "#f8f9fa",
          100: "#f1f3f5",
          200: "#e9ecef",
          300: "#dee2e6",
          700: "#1a1b1e",
          800: "#141517",
          900: "#101113",
          950: "#0a0a0c",
        },
        // Accent for actions
        accent: {
          green: "#51cf66",
          red: "#ff6b6b",
          amber: "#ffd43b",
          cyan: "#66d9e8",
        },
      },
      fontFamily: {
        sans: ["Inter"],
        heading: ["Inter"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
