import type { Config } from "tailwindcss";

// NOTE: placeholder brand palette. Replace with the real Motema colors from
// `motema-charte-*.png` before shipping UI.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#E5484D", // primary — swap for Motema red/coral
          fg: "#FFFFFF",
          muted: "#FBE8E8",
        },
        ink: "#1A1523",
      },
      borderRadius: {
        card: "1.25rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
