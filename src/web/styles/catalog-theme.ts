/**
 * Catalog Theme Constants
 *
 * Shared design tokens for the catalog components.
 * Centralizes colors, fonts, and spacing to avoid duplication.
 *
 * Fixes F12: Hardcoded colors duplicated 15+ times
 *
 * @module web/styles/catalog-theme
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COLORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const colors = {
  // Backgrounds
  bgPrimary: "#0a0908",
  bgElevated: "#0f0f12",
  bgCard: "#141418",
  bgDark: "#0c0c0e",
  bgDarker: "#0a0a0c",

  // Borders
  borderSubtle: "#1a1a1e",
  borderMuted: "#2a2a2e",
  borderHover: "#3a3a3e",

  // Text
  textPrimary: "#f0ede8",
  textSecondary: "#a8a29e",
  textMuted: "#6b6560",
  textDim: "#4a4540",

  // Accents
  accent: "#FFB86F",        // Orange - main accent
  accentUi: "#4ECDC4",      // Teal - UI components
  accentCap: "#4ade80",     // Green - capabilities
  accentError: "#ef4444",   // Red - errors
  accentWarning: "#f59e0b", // Amber - warnings

  // Category accents (from ui-component-categories.ts)
  catDataDisplay: "#4ECDC4",
  catCharts: "#FF6B6B",
  catCode: "#95E1D3",
  catForms: "#FFE66D",
  catVisualization: "#AA96DA",
  catMedia: "#FCBAD3",
  catSystem: "#F38181",
  catSecurity: "#4ade80",
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPOGRAPHY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const fonts = {
  display: "'Instrument Serif', Georgia, serif",
  body: "'Inter', -apple-system, sans-serif",
  mono: "'Geist Mono', monospace",
} as const;

export const fontSizes = {
  xs: "0.5625rem",   // 9px
  sm: "0.625rem",    // 10px
  base: "0.6875rem", // 11px
  md: "0.75rem",     // 12px
  lg: "0.875rem",    // 14px
  xl: "0.9375rem",   // 15px
  "2xl": "1rem",     // 16px
  "3xl": "1.25rem",  // 20px
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SPACING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const spacing = {
  xs: "0.125rem",  // 2px
  sm: "0.25rem",   // 4px
  md: "0.375rem",  // 6px
  lg: "0.5rem",    // 8px
  xl: "0.75rem",   // 12px
  "2xl": "1rem",   // 16px
  "3xl": "1.25rem", // 20px
  "4xl": "1.5rem", // 24px
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BORDERS & SHADOWS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const borders = {
  radius: {
    sm: "3px",
    md: "4px",
    lg: "6px",
    xl: "8px",
    "2xl": "10px",
    "3xl": "12px",
  },
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RGBA HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Convert hex to rgba
 */
export function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Pre-computed common alpha values for accent colors
export const accentAlpha = {
  accent: {
    "06": rgba(colors.accent, 0.06),
    "08": rgba(colors.accent, 0.08),
    "10": rgba(colors.accent, 0.1),
    "15": rgba(colors.accent, 0.15),
    "20": rgba(colors.accent, 0.2),
    "25": rgba(colors.accent, 0.25),
    "30": rgba(colors.accent, 0.3),
    "40": rgba(colors.accent, 0.4),
  },
  ui: {
    "06": rgba(colors.accentUi, 0.06),
    "08": rgba(colors.accentUi, 0.08),
    "10": rgba(colors.accentUi, 0.1),
    "12": rgba(colors.accentUi, 0.12),
    "15": rgba(colors.accentUi, 0.15),
    "20": rgba(colors.accentUi, 0.2),
    "25": rgba(colors.accentUi, 0.25),
    "30": rgba(colors.accentUi, 0.3),
    "40": rgba(colors.accentUi, 0.4),
    "50": rgba(colors.accentUi, 0.5),
  },
  cap: {
    "06": rgba(colors.accentCap, 0.06),
    "08": rgba(colors.accentCap, 0.08),
    "10": rgba(colors.accentCap, 0.1),
    "12": rgba(colors.accentCap, 0.12),
    "15": rgba(colors.accentCap, 0.15),
    "20": rgba(colors.accentCap, 0.2),
    "25": rgba(colors.accentCap, 0.25),
    "30": rgba(colors.accentCap, 0.3),
    "40": rgba(colors.accentCap, 0.4),
  },
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CSS VARIABLES STRING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * CSS custom properties for use in stylesheets
 * Can be injected into <style> tags or used with CSS-in-JS
 */
export const cssVariables = `
  :root {
    /* Backgrounds */
    --bg-primary: ${colors.bgPrimary};
    --bg-elevated: ${colors.bgElevated};
    --bg-card: ${colors.bgCard};
    --bg-dark: ${colors.bgDark};
    --bg-darker: ${colors.bgDarker};

    /* Borders */
    --border-subtle: ${colors.borderSubtle};
    --border-muted: ${colors.borderMuted};
    --border-hover: ${colors.borderHover};

    /* Text */
    --text-primary: ${colors.textPrimary};
    --text-secondary: ${colors.textSecondary};
    --text-muted: ${colors.textMuted};
    --text-dim: ${colors.textDim};

    /* Accents */
    --accent: ${colors.accent};
    --accent-ui: ${colors.accentUi};
    --accent-cap: ${colors.accentCap};
    --accent-error: ${colors.accentError};
    --accent-warning: ${colors.accentWarning};

    /* Fonts */
    --font-display: ${fonts.display};
    --font-body: ${fonts.body};
    --font-mono: ${fonts.mono};
  }
`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANIMATION TIMING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const transitions = {
  fast: "0.1s",
  normal: "0.15s",
  slow: "0.2s",
  verySlow: "0.3s",
  easeOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMON STYLES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Common inline styles that can be spread onto elements
 */
export const commonStyles = {
  cardBase: {
    background: colors.bgDark,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: borders.radius["3xl"],
    overflow: "hidden",
  },

  chipBase: {
    display: "inline-flex",
    alignItems: "center",
    gap: spacing.sm,
    padding: `${spacing.sm} ${spacing.lg}`,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    background: colors.bgCard,
    border: `1px solid ${accentAlpha.accent["06"]}`,
    borderRadius: borders.radius.sm,
    textDecoration: "none",
    cursor: "pointer",
    transition: `all ${transitions.fast}`,
  },

  monoText: {
    fontFamily: fonts.mono,
    letterSpacing: "-0.01em",
  },

  sectionLabel: {
    fontSize: fontSizes.sm,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: colors.textMuted,
  },
} as const;
