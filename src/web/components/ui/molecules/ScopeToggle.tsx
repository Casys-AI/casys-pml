/**
 * ScopeToggle Component - Story 9.8
 *
 * Toggle between "My Usage" (user) and "System" (all users) scope
 * for dashboard metrics filtering.
 *
 * AC #2: UI toggle with hover tooltip explaining behavior
 * AC #6: Tooltip mentions "Available in cloud multi-user mode"
 *
 * @module web/components/ui/molecules/ScopeToggle
 */

import { useState } from "preact/hooks";

export type Scope = "user" | "system";

interface ScopeToggleProps {
  scope: Scope;
  onChange: (scope: Scope) => void;
  isLocalMode?: boolean;
}

export default function ScopeToggle({
  scope,
  onChange,
  isLocalMode = false,
}: ScopeToggleProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const options: Array<{ value: Scope; label: string; description: string }> = [
    {
      value: "user",
      label: "My Usage",
      description: "Tools and metrics from your executions only",
    },
    {
      value: "system",
      label: "System",
      description: "All tools and metrics from any user",
    },
  ];

  return (
    <div
      class="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Toggle buttons */}
      <div
        class="flex rounded-lg overflow-hidden"
        style={{
          background: "var(--bg-surface, #1a1816)",
          border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            class="px-3 py-1.5 text-xs font-medium transition-all duration-200"
            style={{
              background: scope === option.value
                ? "var(--accent-dim, rgba(255, 184, 111, 0.1))"
                : "transparent",
              color: scope === option.value
                ? "var(--accent, #FFB86F)"
                : "var(--text-muted, #d5c3b5)",
              borderRight: option.value === "user"
                ? "1px solid var(--border, rgba(255, 184, 111, 0.1))"
                : "none",
            }}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          class="absolute top-full left-0 mt-2 w-64 p-3 rounded-lg shadow-xl z-50"
          style={{
            background: "var(--bg-elevated, #12110f)",
            border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
          }}
        >
          <div class="text-sm font-medium mb-2" style={{ color: "var(--text, #f5f0ea)" }}>
            Scope Filter
          </div>
          <div class="space-y-2">
            {options.map((option) => (
              <div key={option.value}>
                <span
                  class="text-xs font-semibold"
                  style={{ color: "var(--accent, #FFB86F)" }}
                >
                  {option.label}:
                </span>
                <span
                  class="text-xs ml-1"
                  style={{ color: "var(--text-dim, #8a8078)" }}
                >
                  {option.description}
                </span>
              </div>
            ))}
          </div>

          {/* AC #6: Local mode notice */}
          {isLocalMode && (
            <div
              class="mt-3 pt-2 text-xs"
              style={{
                borderTop: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
                color: "var(--text-dim, #8a8078)",
              }}
            >
              <span style={{ color: "var(--info, #60a5fa)" }}>
                In local mode, both views show the same data.
              </span>
              <br />
              <span>Available in cloud multi-user mode.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
