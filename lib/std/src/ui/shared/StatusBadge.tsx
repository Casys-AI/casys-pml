/**
 * StatusBadge - Enhanced badge with status-specific styling
 *
 * Uses Park UI Badge with semi-transparent background colors
 * matching the budget-allocator design patterns.
 *
 * @module lib/std/src/ui/shared/StatusBadge
 */

import { type ComponentProps } from "react";
import { Badge } from "../components/ui/badge";
import { css, cx } from "../styled-system/css";
import { interactive } from "./interactions";

export type StatusVariant = "success" | "warning" | "error" | "info" | "neutral";

export interface StatusBadgeProps extends Omit<ComponentProps<typeof Badge>, "variant"> {
  /** Status determines the color scheme */
  status: StatusVariant;
  /** Optional icon to display before text */
  icon?: React.ReactNode;
  /** Enable hover scale effect */
  interactive?: boolean;
}

const statusStyles: Record<StatusVariant, string> = {
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

const baseStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  fontWeight: "medium",
  px: "2",
  py: "1",
  borderRadius: "md",
  fontSize: "xs",
});

export function StatusBadge({
  status,
  icon,
  interactive: isInteractive = false,
  children,
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge
      variant="subtle"
      className={cx(
        baseStyle,
        statusStyles[status],
        isInteractive && interactive.scaleOnHover,
        className
      )}
      {...props}
    >
      {icon && <span className={css({ flexShrink: 0 })}>{icon}</span>}
      {children}
    </Badge>
  );
}

/**
 * Status icons for common use cases
 */
export const StatusIcons = {
  success: "✓",
  warning: "⚠",
  error: "✕",
  info: "ℹ",
  neutral: "•",
} as const;
