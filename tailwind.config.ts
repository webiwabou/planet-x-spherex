import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/components/**/*.{js,ts,jsx,tsx,mdx}", "./src/app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)",
        ink: "var(--ink)",
        mute: "var(--mute)",
        line: "var(--line)",
        signal: "var(--signal)",
        warn: "var(--warn)",
        panel: "var(--panel)",
        veil: "var(--veil)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
