/**
 * TrendIndicator - Displays trend direction arrow with color
 *
 * Part of CAS (Complex Adaptive Systems) emergence metrics visualization.
 *
 * @module web/components/ui/atoms/TrendIndicator
 */

import type { JSX } from "preact";
import type { Trend } from "../../../../shared/emergence.types.ts";

export type TrendSize = "sm" | "md";

export interface TrendIndicatorProps {
  /** Trend direction */
  trend: Trend;
  /** Size variant */
  size?: TrendSize;
}

const COLORS: Record<Trend, string> = {
  rising: "var(--success, #4ade80)",
  falling: "var(--error, #f87171)",
  stable: "var(--text-dim, #8a8078)",
};

const ARROWS: Record<Trend, string> = {
  rising: "\u2191",
  falling: "\u2193",
  stable: "\u2192",
};

const SIZE_CLASSES: Record<TrendSize, string> = {
  sm: "text-xs",
  md: "text-sm",
};

/**
 * Displays a trend indicator arrow with semantic colors
 */
export function TrendIndicator({
  trend,
  size = "sm",
}: TrendIndicatorProps): JSX.Element {
  return (
    <span
      class={`font-bold ${SIZE_CLASSES[size]}`}
      style={{ color: COLORS[trend] }}
      title={`Trend: ${trend}`}
    >
      {ARROWS[trend]}
    </span>
  );
}

export default TrendIndicator;
