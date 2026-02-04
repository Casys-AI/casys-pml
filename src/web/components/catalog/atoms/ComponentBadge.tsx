/**
 * ComponentBadge - Type indicator badge
 *
 * Displays a colored badge indicating the entry type:
 * - UI Component (teal)
 * - MCP Tool (amber)
 * - Capability (green)
 *
 * @module web/components/catalog/atoms/ComponentBadge
 */

type BadgeType = "ui" | "tool" | "capability";

interface ComponentBadgeProps {
  type: BadgeType;
  size?: "sm" | "md";
}

const BADGE_CONFIG: Record<BadgeType, { label: string; color: string; bg: string }> = {
  ui: {
    label: "UI",
    color: "#4ECDC4",
    bg: "rgba(78, 205, 196, 0.15)",
  },
  tool: {
    label: "Tool",
    color: "#FFB86F",
    bg: "rgba(255, 184, 111, 0.15)",
  },
  capability: {
    label: "Cap",
    color: "#4ade80",
    bg: "rgba(74, 222, 128, 0.15)",
  },
};

export default function ComponentBadge({ type, size = "sm" }: ComponentBadgeProps) {
  const config = BADGE_CONFIG[type];
  const isSmall = size === "sm";

  return (
    <span
      class="component-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: isSmall ? "2px 6px" : "3px 8px",
        borderRadius: "4px",
        fontSize: isSmall ? "0.625rem" : "0.7rem",
        fontWeight: 600,
        fontFamily: "'Geist Mono', monospace",
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.color}30`,
      }}
    >
      {config.label}
    </span>
  );
}
