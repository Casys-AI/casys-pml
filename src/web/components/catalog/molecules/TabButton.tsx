/**
 * TabButton - Navigation tab button
 *
 * Individual tab for the tab navigation bar.
 * Supports different types with accent colors.
 *
 * @module web/components/catalog/molecules/TabButton
 */

interface TabButtonProps {
  /** Tab identifier */
  id: string;
  /** Display label */
  label: string;
  /** Item count */
  count: number;
  /** Tab icon */
  icon?: string;
  /** Whether this tab is active */
  isActive: boolean;
  /** Tab type for color */
  type?: "components" | "tools" | "capabilities";
  /** Click handler */
  onClick: (id: string) => void;
}

const TYPE_COLORS = {
  components: "#4ECDC4",
  tools: "#FFB86F",
  capabilities: "#4ade80",
};

export default function TabButton({
  id,
  label,
  count,
  icon,
  isActive,
  type = "tools",
  onClick,
}: TabButtonProps) {
  const accentColor = TYPE_COLORS[type];

  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      class={`tab-button ${isActive ? "active" : ""}`}
      data-type={type}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 16px",
        border: "none",
        borderRadius: "8px",
        fontFamily: "'Geist Mono', monospace",
        fontSize: "0.8125rem",
        fontWeight: isActive ? 600 : 500,
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        background: isActive ? accentColor : "transparent",
        color: isActive ? "#0a0908" : "#a8a29e",
      }}
    >
      {/* Icon */}
      {icon && (
        <span
          style={{
            fontSize: "0.875rem",
            filter: isActive ? "none" : "grayscale(0.3)",
            transition: "filter 0.2s",
          }}
        >
          {icon}
        </span>
      )}

      {/* Label */}
      <span>{label}</span>

      {/* Count */}
      <span
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          padding: "2px 6px",
          borderRadius: "6px",
          background: isActive ? "rgba(0, 0, 0, 0.2)" : `${accentColor}15`,
          color: isActive ? "#0a0908" : accentColor,
          transition: "all 0.2s",
        }}
      >
        {count}
      </span>

      <style>
        {`
          .tab-button:hover:not(.active) {
            background: rgba(255, 255, 255, 0.05);
            color: #f0ede8;
          }

          .tab-button:focus-visible {
            outline: 2px solid ${accentColor};
            outline-offset: 2px;
          }
        `}
      </style>
    </button>
  );
}
