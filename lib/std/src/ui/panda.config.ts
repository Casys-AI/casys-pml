import { defineConfig } from "@pandacss/dev";
import { createPreset } from "@park-ui/panda-preset";
import blue from "@park-ui/panda-preset/colors/blue";
import slate from "@park-ui/panda-preset/colors/slate";
import { group } from "./styled-system/recipes/group";
import { absoluteCenter } from "./styled-system/recipes/absolute-center";

export default defineConfig({
  // Use Park UI preset with blue accent and slate gray
  presets: [
    "@pandacss/preset-base",
    createPreset({
      accentColor: blue,
      grayColor: slate,
      radius: "md",
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

  // Use React JSX
  jsxFramework: "react",

  // Custom recipes from Park UI CLI
  theme: {
    extend: {
      recipes: {
        group,
        absoluteCenter,
      },
    },
  },
});