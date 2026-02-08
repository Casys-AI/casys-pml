/**
 * LevelBadge - Composition level indicator
 *
 * Shows the composition level of an item:
 * - L0 = Atomic tools (leaves, no dependencies)
 * - L1-L6 = Composed capabilities (higher = more composition)
 * - UI = Visual component
 *
 * @module web/components/catalog/atoms/LevelBadge
 */

export type LevelType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | "ui";

interface LevelBadgeProps {
  level: LevelType;
  size?: "sm" | "md";
}

const LEVEL_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; glow: string }
> = {
  "0": {
    label: "L0",
    color: "#FFB86F",
    bg: "rgba(255, 184, 111, 0.12)",
    glow: "rgba(255, 184, 111, 0.25)",
  },
  "1": {
    label: "L1",
    color: "#4ade80",
    bg: "rgba(74, 222, 128, 0.12)",
    glow: "rgba(74, 222, 128, 0.25)",
  },
  "2": {
    label: "L2",
    color: "#34d399",
    bg: "rgba(52, 211, 153, 0.12)",
    glow: "rgba(52, 211, 153, 0.25)",
  },
  "3": {
    label: "L3",
    color: "#2dd4bf",
    bg: "rgba(45, 212, 191, 0.12)",
    glow: "rgba(45, 212, 191, 0.25)",
  },
  "4": {
    label: "L4",
    color: "#22d3d1",
    bg: "rgba(34, 211, 209, 0.12)",
    glow: "rgba(34, 211, 209, 0.25)",
  },
  "5": {
    label: "L5",
    color: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.12)",
    glow: "rgba(56, 189, 248, 0.25)",
  },
  "6": {
    label: "L6",
    color: "#818cf8",
    bg: "rgba(129, 140, 248, 0.12)",
    glow: "rgba(129, 140, 248, 0.25)",
  },
  ui: {
    label: "UI",
    color: "#4ECDC4",
    bg: "rgba(78, 205, 196, 0.12)",
    glow: "rgba(78, 205, 196, 0.25)",
  },
};

export default function LevelBadge({ level, size = "sm" }: LevelBadgeProps) {
  const config = LEVEL_CONFIG[String(level)];
  const isSmall = size === "sm";

  return (
    <span
      class="level-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: isSmall ? "28px" : "32px",
        padding: isSmall ? "2px 5px" : "3px 7px",
        borderRadius: "4px",
        fontSize: isSmall ? "0.625rem" : "0.7rem",
        fontWeight: 700,
        fontFamily: "'Geist Mono', monospace",
        letterSpacing: "0.02em",
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.color}40`,
        boxShadow: `0 0 8px ${config.glow}`,
        transition: "all 0.2s ease",
      }}
    >
      {config.label}
    </span>
  );
}

/** Get level from item type */
export function getLevelFromType(
  type: "tool" | "capability" | "ui",
  compositionDepth?: number
): LevelType {
  if (type === "tool") return 0;
  if (type === "ui") return "ui";
  // Capabilities: use compositionDepth or default to 1
  return Math.min(Math.max(compositionDepth ?? 1, 1), 6) as LevelType;
}
