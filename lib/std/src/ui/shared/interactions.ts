/**
 * Shared micro-interactions for MCP Apps UIs
 *
 * Provides consistent hover, focus, and transition effects
 * across all components following the budget-allocator design patterns.
 *
 * @module lib/std/src/ui/shared/interactions
 */

import { css } from "../styled-system/css";

/**
 * Micro-interactions for interactive elements
 */
export const interactive = {
  /** Subtle scale effect for buttons, badges, chips */
  scaleOnHover: css({
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    cursor: "pointer",
    _hover: { transform: "scale(1.02)" },
    _active: { transform: "scale(0.98)" },
  }),

  /** Larger scale effect for small elements (thumbs, dots, icons) */
  scaleOnHoverLarge: css({
    transition: "transform 0.1s ease",
    cursor: "pointer",
    _hover: { transform: "scale(1.15)" },
  }),

  /** Focus ring for keyboard navigation */
  focusRing: css({
    _focus: {
      outline: "none",
      boxShadow: "0 0 0 3px token(colors.blue.500/30)",
    },
    _focusVisible: {
      outline: "none",
      boxShadow: "0 0 0 3px token(colors.blue.500/30)",
    },
  }),

  /** Row hover for tables and lists */
  rowHover: css({
    transition: "background-color 0.15s ease",
    cursor: "pointer",
    _hover: { bg: "bg.subtle" },
  }),

  /** Selected row state */
  rowSelected: css({
    bg: "blue.50",
    _hover: { bg: "blue.100" },
    _dark: { bg: "blue.950", _hover: { bg: "blue.900" } },
  }),

  /** Card with shadow on hover */
  cardHover: css({
    transition: "box-shadow 0.2s ease, transform 0.2s ease",
    _hover: {
      boxShadow: "0 4px 12px token(colors.gray.900/10)",
      transform: "translateY(-1px)",
    },
  }),

  /** Clickable element base */
  clickable: css({
    cursor: "pointer",
    userSelect: "none",
    transition: "opacity 0.15s ease",
    _hover: { opacity: 0.8 },
    _active: { opacity: 0.6 },
  }),
};

/**
 * Status badge styles with semi-transparent backgrounds
 * Use with Badge component: <Badge className={statusStyles.success}>
 */
export const statusStyles = {
  success: css({
    color: "green.600",
    bg: "green.500/15",
    _dark: { color: "green.400", bg: "green.500/20" },
  }),
  warning: css({
    color: "yellow.600",
    bg: "yellow.500/15",
    _dark: { color: "yellow.400", bg: "yellow.500/20" },
  }),
  error: css({
    color: "red.600",
    bg: "red.500/15",
    _dark: { color: "red.400", bg: "red.500/20" },
  }),
  info: css({
    color: "blue.600",
    bg: "blue.500/15",
    _dark: { color: "blue.400", bg: "blue.500/20" },
  }),
  neutral: css({
    color: "gray.600",
    bg: "gray.500/10",
    _dark: { color: "gray.400", bg: "gray.500/15" },
  }),
};

/**
 * Value transitions for animated numbers (gauges, progress)
 */
export const valueTransition = css({
  transition: "all 0.5s ease-out",
});

/**
 * Typography scale for visual hierarchy
 */
export const typography = {
  /** Section titles */
  sectionTitle: css({
    fontSize: "lg",
    fontWeight: "semibold",
    color: "fg.default",
  }),

  /** Primary labels */
  label: css({
    fontSize: "sm",
    fontWeight: "medium",
    color: "fg.default",
  }),

  /** Large metric values */
  value: css({
    fontSize: "2xl",
    fontWeight: "bold",
    fontFamily: "mono",
    fontVariantNumeric: "tabular-nums",
  }),

  /** Small metric values */
  valueSmall: css({
    fontSize: "lg",
    fontWeight: "semibold",
    fontFamily: "mono",
    fontVariantNumeric: "tabular-nums",
  }),

  /** Secondary/muted text */
  muted: css({
    fontSize: "xs",
    color: "fg.muted",
  }),

  /** Amounts and currencies */
  amount: css({
    fontSize: "sm",
    fontFamily: "mono",
    fontVariantNumeric: "tabular-nums",
  }),
};

/**
 * Common container styles
 */
export const containers = {
  /** Base container for UI components */
  root: css({
    p: "4",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
  }),

  /** Card-like container with subtle background */
  card: css({
    p: "4",
    bg: "bg.subtle",
    borderRadius: "lg",
    borderWidth: "1px",
    borderColor: "border.default",
  }),

  /** Centered content container */
  centered: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    p: "10",
    color: "fg.muted",
  }),
};
