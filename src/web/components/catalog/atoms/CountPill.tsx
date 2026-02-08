/**
 * CountPill - Numeric count indicator
 *
 * Compact pill showing a count value, used for
 * tool counts, component counts, etc.
 *
 * @module web/components/catalog/atoms/CountPill
 */

interface CountPillProps {
  /** Count value */
  count: number;
  /** Optional label */
  label?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Color variant */
  variant?: "accent" | "ui" | "capability" | "muted";
}

const VARIANT_COLORS = {
  accent: { bg: "rgba(255, 184, 111, 0.12)", color: "#FFB86F" },
  ui: { bg: "rgba(78, 205, 196, 0.12)", color: "#4ECDC4" },
  capability: { bg: "rgba(74, 222, 128, 0.12)", color: "#4ade80" },
  muted: { bg: "#1a1a1e", color: "#6b6560" },
};

const SIZE_STYLES = {
  sm: { padding: "2px 6px", fontSize: "0.625rem" },
  md: { padding: "3px 8px", fontSize: "0.7rem" },
  lg: { padding: "4px 10px", fontSize: "0.75rem" },
};

export default function CountPill({
  count,
  label,
  size = "md",
  variant = "accent",
}: CountPillProps) {
  const colors = VARIANT_COLORS[variant];
  const sizeStyles = SIZE_STYLES[size];

  return (
    <span
      class="count-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        borderRadius: "10px",
        fontFamily: "'Geist Mono', monospace",
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: colors.bg,
        color: colors.color,
        ...sizeStyles,
      }}
    >
      <span>{count.toLocaleString()}</span>
      {label && (
        <span style={{ opacity: 0.75, fontWeight: 500 }}>{label}</span>
      )}
    </span>
  );
}
