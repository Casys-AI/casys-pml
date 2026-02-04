/**
 * CategoryLabel - Category header with icon
 *
 * Displays a category name with its icon and component count,
 * used as section headers in the component grid.
 *
 * @module web/components/catalog/atoms/CategoryLabel
 */

interface CategoryLabelProps {
  /** Category icon emoji */
  icon: string;
  /** Category display name */
  label: string;
  /** Number of items in category */
  count: number;
  /** Accent color for the category */
  accentColor?: string;
  /** Whether the section is collapsed */
  collapsed?: boolean;
  /** Click handler for collapse toggle */
  onClick?: () => void;
}

export default function CategoryLabel({
  icon,
  label,
  count,
  accentColor = "#4ECDC4",
  collapsed = false,
  onClick,
}: CategoryLabelProps) {
  const isClickable = typeof onClick === "function";

  return (
    <div
      class="category-label"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 0",
        cursor: isClickable ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {/* Collapse indicator */}
      {isClickable && (
        <span
          style={{
            fontSize: "0.625rem",
            color: "#4a4540",
            transition: "transform 0.2s ease",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      )}

      {/* Icon */}
      <span
        style={{
          fontSize: "1.125rem",
          filter: collapsed ? "grayscale(0.5)" : "none",
          transition: "filter 0.2s",
        }}
      >
        {icon}
      </span>

      {/* Label */}
      <span
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: collapsed ? "#6b6560" : "#f0ede8",
          letterSpacing: "-0.01em",
          transition: "color 0.2s",
        }}
      >
        {label}
      </span>

      {/* Count pill */}
      <span
        style={{
          fontSize: "0.6875rem",
          fontFamily: "'Geist Mono', monospace",
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: "10px",
          background: collapsed ? "#1a1a1e" : `${accentColor}15`,
          color: collapsed ? "#4a4540" : accentColor,
          transition: "all 0.2s",
        }}
      >
        {count}
      </span>

      {/* Separator line */}
      <div
        style={{
          flex: 1,
          height: "1px",
          background: `linear-gradient(90deg, ${accentColor}20 0%, transparent 100%)`,
          marginLeft: "8px",
        }}
      />

      <style>
        {`
          .category-label:hover {
            opacity: ${isClickable ? 0.85 : 1};
          }
        `}
      </style>
    </div>
  );
}
