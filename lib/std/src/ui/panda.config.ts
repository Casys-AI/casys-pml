import { defineConfig } from "@pandacss/dev";
import { createPreset } from "@park-ui/panda-preset";

export default defineConfig({
  // Use Park UI preset with neutral palette
  presets: [
    "@pandacss/preset-base",
    createPreset({
      accentColor: "blue",
      grayColor: "slate",
      borderRadius: "md",
    }),
  ],

  // Enable preflight (CSS reset)
  preflight: true,

  // Where to look for CSS declarations
  include: ["./**/index.html", "./**/src/**/*.{js,jsx,ts,tsx}"],

  // Files to exclude
  exclude: ["./node_modules/**", "./dist/**"],

  // The output directory
  outdir: "styled-system",

  // Use Preact JSX
  jsxFramework: "react", // Preact uses React JSX via compat
});
