/**
 * UnifiedItemCard - Universal card for catalog items
 *
 * Displays Tools, Capabilities, or UI Components in a unified style
 * with level indicators (L0 for atomic, L1-L6 for composed, UI for components)
 *
 * @module web/components/catalog/molecules/UnifiedItemCard
 */

import LevelBadge, { getLevelFromType } from "../atoms/LevelBadge.tsx";

export type ItemType = "tool" | "capability" | "ui";

export interface UnifiedItem {
  id: string;
  name: string;
  description: string | null;
  type: ItemType;
  /** For capabilities: composition depth (1-6) */
  level?: number;
  /** For tools: server category icon */
  icon?: string;
  /** For UI: category info */
  category?: {
    icon: string;
    label: string;
    color: string;
  };
  /** Preview URI for UI components */
  resourceUri?: string;
  /** Additional tags */
  tags?: string[];
  /** Link to detail page */
  href: string;
}

interface UnifiedItemCardProps {
  item: UnifiedItem;
  index?: number;
  compact?: boolean;
}

const TYPE_STYLES: Record<ItemType, { accent: string; border: string }> = {
  tool: {
    accent: "#FFB86F",
    border: "rgba(255, 184, 111, 0.12)",
  },
  capability: {
    accent: "#4ade80",
    border: "rgba(74, 222, 128, 0.12)",
  },
  ui: {
    accent: "#4ECDC4",
    border: "rgba(78, 205, 196, 0.12)",
  },
};

export default function UnifiedItemCard({
  item,
  index = 0,
  compact = false,
}: UnifiedItemCardProps) {
  const style = TYPE_STYLES[item.type];
  const level = getLevelFromType(item.type, item.level);
  const animDelay = Math.min(index * 25, 400);

  return (
    <a
      href={item.href}
      class={`unified-card unified-card--${item.type}`}
      style={{
        display: "flex",
        flexDirection: compact ? "row" : "column",
        gap: compact ? "12px" : "0",
        padding: compact ? "12px 14px" : "0",
        background: "#0c0c0e",
        border: `1px solid ${style.border}`,
        borderRadius: "10px",
        overflow: "hidden",
        textDecoration: "none",
        cursor: "pointer",
        animation: `cardSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) ${animDelay}ms both`,
      }}
    >
      {/* Icon / Preview area */}
      <div
        class="unified-card__visual"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: compact ? "40px" : "100%",
          height: compact ? "40px" : "48px",
          background: compact ? style.border : `linear-gradient(135deg, #0a0a0c 0%, ${style.border} 100%)`,
          borderRadius: compact ? "8px" : "0",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {item.icon ? (
          <span style={{ fontSize: compact ? "1.25rem" : "1.5rem" }}>{item.icon}</span>
        ) : item.category?.icon ? (
          <span style={{ fontSize: compact ? "1.25rem" : "1.5rem" }}>{item.category.icon}</span>
        ) : (
          <span style={{ fontSize: compact ? "1rem" : "1.25rem", color: style.accent }}>
            {item.type === "tool" ? "⚙️" : item.type === "capability" ? "⚡" : "🎨"}
          </span>
        )}

        {/* Level badge - top right for non-compact */}
        {!compact && (
          <div style={{ position: "absolute", top: "8px", right: "8px" }}>
            <LevelBadge level={level} size="sm" />
          </div>
        )}
      </div>

      {/* Content */}
      <div
        class="unified-card__content"
        style={{
          flex: 1,
          padding: compact ? "0" : "12px 14px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <h3
            class="unified-card__name"
            style={{
              margin: 0,
              fontSize: compact ? "0.8125rem" : "0.875rem",
              fontWeight: 600,
              fontFamily: "'Geist Mono', monospace",
              color: "#f0ede8",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
            }}
          >
            {item.name}
          </h3>

          {/* Level badge inline for compact */}
          {compact && <LevelBadge level={level} size="sm" />}
        </div>

        {/* Description */}
        {item.description && !compact && (
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              color: "#6b6560",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.description}
          </p>
        )}

        {/* Tags / Category */}
        {!compact && (item.tags?.length || item.category) && (
          <div
            style={{
              marginTop: "6px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
            }}
          >
            {item.category && (
              <span
                style={{
                  fontSize: "0.6875rem",
                  color: item.category.color,
                  fontFamily: "'Geist Mono', monospace",
                }}
              >
                {item.category.label}
              </span>
            )}
            {item.tags?.slice(0, 2).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: "0.625rem",
                  color: "#4a4540",
                  background: "rgba(255,255,255,0.03)",
                  padding: "2px 6px",
                  borderRadius: "3px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <style>
        {`
          @keyframes cardSlideIn {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .unified-card {
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .unified-card:hover {
            border-color: ${style.accent}40;
            transform: translateY(-2px);
            box-shadow:
              0 8px 24px -8px rgba(0, 0, 0, 0.4),
              0 0 0 1px ${style.accent}15;
          }

          .unified-card:hover .unified-card__name {
            color: ${style.accent};
          }

          .unified-card:hover .unified-card__visual {
            background: ${compact ? `${style.accent}20` : `linear-gradient(135deg, #0a0a0c 0%, ${style.accent}15 100%)`};
          }
        `}
      </style>
    </a>
  );
}
