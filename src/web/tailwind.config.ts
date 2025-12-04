import { type Config } from "tailwindcss";

export default {
  content: [
    "{routes,islands,components}/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        glass: {
          bg: "rgba(15, 23, 42, 0.8)",
          border: "rgba(148, 163, 184, 0.1)",
        },
      },
      backdropBlur: {
        glass: "12px",
      },
      boxShadow: {
        glow: "0 0 12px currentColor",
        "glow-blue": "0 4px 12px rgba(59, 130, 246, 0.4)",
        "glow-purple": "0 0 12px rgba(139, 92, 246, 0.4)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
      },
      animation: {
        "spin-slow": "spin 0.8s linear infinite",
        "slide-up": "slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "fade-slide": "fadeSlideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        slideUp: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeSlideDown: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
