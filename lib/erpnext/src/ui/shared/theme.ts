/**
 * ERPNext UI Theme — CSS-in-JS style objects
 *
 * Provides reusable style fragments for consistent look
 * across all ERPNext MCP Apps viewers.
 */

import { CSSProperties } from "react";

export const colors = {
  bg: { root: "#08080a", surface: "#111113", elevated: "#18181b", hover: "#1f1f23", active: "#27272a" },
  text: { primary: "#e7e5e4", secondary: "#a8a29e", muted: "#78716c", faint: "#57534e" },
  accent: "#0089FF",
  accentDim: "rgba(0,137,255,0.15)",
  border: "#27272a",
  borderSubtle: "#1f1f23",
  success: "#4ade80",
  successDim: "rgba(74,222,128,0.12)",
  error: "#f87171",
  errorDim: "rgba(248,113,113,0.12)",
  warning: "#fbbf24",
  warningDim: "rgba(251,191,36,0.12)",
  info: "#60a5fa",
  infoDim: "rgba(96,165,250,0.12)",
} as const;

export const fonts = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
} as const;

// Reusable style fragments
export const styles = {
  card: {
    background: colors.bg.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: "8px",
    padding: "16px",
  } as CSSProperties,

  badge: (color: string, bg: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: 600,
    borderRadius: "4px",
    color,
    background: bg,
    letterSpacing: "0.02em",
  }),

  input: {
    background: colors.bg.elevated,
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "13px",
    color: colors.text.primary,
    outline: "none",
    transition: "border-color 0.15s",
    width: "100%",
    fontFamily: fonts.sans,
  } as CSSProperties,

  button: {
    background: colors.bg.elevated,
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "12px",
    color: colors.text.secondary,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: fonts.sans,
    whiteSpace: "nowrap" as const,
  } as CSSProperties,

  buttonActive: {
    background: colors.accentDim,
    borderColor: colors.accent,
    color: colors.accent,
  } as CSSProperties,

  tableHeader: {
    padding: "8px 12px",
    textAlign: "left" as const,
    fontSize: "11px",
    fontWeight: 600,
    color: colors.text.muted,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${colors.border}`,
    cursor: "pointer",
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
    transition: "color 0.15s",
  } as CSSProperties,

  tableCell: {
    padding: "8px 12px",
    fontSize: "13px",
    borderBottom: `1px solid ${colors.borderSubtle}`,
    color: colors.text.primary,
  } as CSSProperties,

  mono: {
    fontFamily: fonts.mono,
    fontSize: "12px",
  } as CSSProperties,
} as const;

/** Format a number with locale separators */
export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format currency */
export function formatCurrency(n: number, currency = "USD"): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
