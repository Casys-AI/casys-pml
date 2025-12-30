/**
 * RecommendationsPanel - Displays emergence metric recommendations
 *
 * Shows collapsible list of recommendations based on CAS metrics analysis.
 * Supports warning, info, and success recommendation types.
 *
 * @module web/components/ui/molecules/RecommendationsPanel
 */

import { useState } from "preact/hooks";
import type { Recommendation } from "../../../../shared/emergence.types.ts";

interface RecommendationsPanelProps {
  /** List of recommendations */
  recommendations: Recommendation[];
}

const TYPE_STYLES: Record<
  Recommendation["type"],
  { bg: string; border: string; icon: string }
> = {
  warning: { bg: "rgba(251, 191, 36, 0.1)", border: "#fbbf24", icon: "⚠️" },
  info: { bg: "rgba(96, 165, 250, 0.1)", border: "#60a5fa", icon: "ℹ️" },
  success: { bg: "rgba(74, 222, 128, 0.1)", border: "#4ade80", icon: "✓" },
};

/**
 * Collapsible panel showing emergence recommendations
 */
export function RecommendationsPanel({
  recommendations,
}: RecommendationsPanelProps) {
  const [collapsed, setCollapsed] = useState(recommendations.length === 0);

  if (recommendations.length === 0) return null;

  return (
    <div
      class="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      <button
        type="button"
        class="w-full p-2 flex items-center justify-between text-sm font-semibold"
        style={{ color: "var(--text)" }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>Recommendations ({recommendations.length})</span>
        <span style={{ color: "var(--text-dim)" }}>
          {collapsed ? "▶" : "▼"}
        </span>
      </button>
      {!collapsed && (
        <div class="px-2 pb-2 space-y-2">
          {recommendations.map((rec, idx) => {
            const style = TYPE_STYLES[rec.type];
            return (
              <div
                key={idx}
                class="p-2 rounded text-xs"
                style={{
                  background: style.bg,
                  borderLeft: `3px solid ${style.border}`,
                }}
              >
                <div class="flex items-start gap-1.5">
                  <span>{style.icon}</span>
                  <div>
                    <div style={{ color: "var(--text)" }}>{rec.message}</div>
                    {rec.action && (
                      <div class="mt-1" style={{ color: "var(--text-muted)" }}>
                        → {rec.action}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RecommendationsPanel;
