import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        space: {
          950: "#05070f",
          900: "#090d1a",
          850: "#0f1629",
          800: "#15203b",
          700: "#1f2f54",
        },
        spherex: {
          cyan: "#38bdf8",
          amber: "#f59e0b",
          infrared: "#f43f5e",
          purple: "#a855f7",
          green: "#10b981",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
