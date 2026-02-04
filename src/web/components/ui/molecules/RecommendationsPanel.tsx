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
  recommendations: Recommendation[];
}

const TYPE_STYLES: Record<
  Recommendation["type"],
  { bg: string; border: string; icon: string }
> = {
  warning: { bg: "bg-amber-400/10", border: "border-l-amber-400", icon: "⚠️" },
  info: { bg: "bg-blue-400/10", border: "border-l-blue-400", icon: "ℹ️" },
  success: { bg: "bg-green-400/10", border: "border-l-green-400", icon: "✓" },
};

export function RecommendationsPanel({
  recommendations,
}: RecommendationsPanelProps) {
  const [collapsed, setCollapsed] = useState(recommendations.length === 0);

  if (recommendations.length === 0) return null;

  return (
    <div class="rounded-lg overflow-hidden bg-stone-900 border border-amber-500/10">
      <button
        type="button"
        class="w-full p-2 flex items-center justify-between text-sm font-semibold text-stone-100"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>Recommendations ({recommendations.length})</span>
        <span class="text-stone-500">
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
                class={`p-2 rounded text-xs border-l-[3px] ${style.bg} ${style.border}`}
              >
                <div class="flex items-start gap-1.5">
                  <span>{style.icon}</span>
                  <div>
                    <div class="text-stone-100">{rec.message}</div>
                    {rec.action && (
                      <div class="mt-1 text-stone-400">
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
