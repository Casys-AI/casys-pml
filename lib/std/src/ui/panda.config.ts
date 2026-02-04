import { defineConfig, defineRecipe, defineSlotRecipe } from "@pandacss/dev";
import { createPreset } from "@park-ui/panda-preset";
import blue from "@park-ui/panda-preset/colors/blue";
import slate from "@park-ui/panda-preset/colors/slate";
import { group } from "./styled-system/recipes/group";
import { absoluteCenter } from "./styled-system/recipes/absolute-center";

// Skeleton recipe with loading animations
const skeleton = defineRecipe({
  className: 'skeleton',
  jsx: ['Skeleton', 'SkeletonCircle', 'SkeletonText'],
  base: {},
  variants: {
    loading: {
      true: {
        borderRadius: 'l2',
        boxShadow: 'none',
        backgroundClip: 'padding-box',
        cursor: 'default',
        color: 'transparent',
        pointerEvents: 'none',
        userSelect: 'none',
        flexShrink: '0',
        '&::before, &::after, *': {
          visibility: 'hidden',
        },
      },
      false: {
        background: 'unset',
        animation: 'fade-in var(--fade-duration, 0.1s) ease-out !important',
      },
    },
    circle: {
      true: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        borderRadius: '9999px',
      },
    },
    variant: {
      pulse: {
        background: 'gray.subtle.bg.active',
        animation: 'pulse',
        animationDuration: 'var(--duration, 1.2s)',
      },
      shine: {
        '--animate-from': '200%',
        '--animate-to': '-200%',
        '--start-color': 'colors.gray.subtle.bg',
        '--end-color': 'colors.gray.subtle.bg.active',
        backgroundImage:
          'linear-gradient(270deg,var(--start-color),var(--end-color),var(--end-color),var(--start-color))',
        backgroundSize: '400% 100%',
        animation: 'bg-position var(--duration, 5s) ease-in-out infinite',
      },
      none: {
        animation: 'none',
      },
    },
  },
  defaultVariants: {
    variant: 'pulse',
    loading: true,
  },
});

// Alert recipe with status variants
const alert = defineSlotRecipe({
  className: 'alert',
  slots: ['root', 'content', 'description', 'indicator', 'title'],
  base: {
    root: {
      alignItems: 'flex-start',
      borderRadius: 'l3',
      display: 'flex',
      position: 'relative',
      width: 'full',
    },
    content: {
      display: 'flex',
      flex: '1',
      flexDirection: 'column',
      gap: '1',
    },
    description: {
      display: 'inline',
    },
    indicator: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
    },
    title: {
      fontWeight: 'semibold',
    },
  },
  defaultVariants: {
    size: 'md',
    status: 'info',
    variant: 'subtle',
  },
  variants: {
    size: {
      md: {
        root: { gap: '3', p: '4', textStyle: 'sm' },
        indicator: { _icon: { width: '5', height: '5' } },
      },
      lg: {
        root: { gap: '4', p: '4', textStyle: 'md' },
        indicator: { _icon: { width: '6', height: '6' } },
      },
    },
    variant: {
      solid: {
        root: { bg: 'colorPalette.solid.bg', color: 'colorPalette.solid.fg' },
      },
      surface: {
        root: {
          bg: 'colorPalette.surface.bg',
          borderWidth: '1px',
          borderColor: 'colorPalette.surface.border',
          color: 'colorPalette.surface.fg',
        },
      },
      subtle: {
        root: { bg: 'colorPalette.subtle.bg', color: 'colorPalette.subtle.fg' },
      },
      outline: {
        root: {
          borderWidth: '1px',
          borderColor: 'colorPalette.outline.border',
          color: 'colorPalette.outline.fg',
        },
      },
    },
    status: {
      info: { root: { colorPalette: 'blue' } },
      warning: { root: { colorPalette: 'orange' } },
      success: { root: { colorPalette: 'green' } },
      error: { root: { colorPalette: 'red' } },
      neutral: {},
    },
  },
});

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
        skeleton,
      },
      slotRecipes: {
        alert,
      },
    },
  },
});