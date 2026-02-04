/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./**/src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./shared/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        fg: {
          default: "var(--fg-default, #1a1a1a)",
          muted: "var(--fg-muted, #6b7280)",
        },
        bg: {
          canvas: "var(--bg-canvas, #ffffff)",
          subtle: "var(--bg-subtle, #f9fafb)",
          muted: "var(--bg-muted, #f3f4f6)",
        },
        border: {
          default: "var(--border-default, #e5e7eb)",
          subtle: "var(--border-subtle, #f3f4f6)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      animation: {
        "pulse-subtle": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "skeleton-shine": "shine 1.5s ease-in-out infinite",
      },
      keyframes: {
        shine: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
