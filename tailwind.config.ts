import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Political lean palette (used across bias visualizations + badges)
        lean: {
          left: "#2563eb",
          "lean-left": "#60a5fa",
          center: "#a3a3a3",
          "lean-right": "#f87171",
          right: "#dc2626",
        },
        good: "#16a34a",
        bad: "#dc2626",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      spacing: {
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-top": "env(safe-area-inset-top)",
      },
    },
  },
  plugins: [],
};

export default config;
