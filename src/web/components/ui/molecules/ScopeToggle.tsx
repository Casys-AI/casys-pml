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

import type { JSX } from "preact";
import { useState } from "preact/hooks";

export type Scope = "user" | "system";

export interface ScopeToggleProps {
  scope: Scope;
  onChange: (scope: Scope) => void;
  isLocalMode?: boolean;
}

interface ScopeOption {
  value: Scope;
  label: string;
  description: string;
}

const SCOPE_OPTIONS: ScopeOption[] = [
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

export default function ScopeToggle({
  scope,
  onChange,
  isLocalMode = false,
}: ScopeToggleProps): JSX.Element {
  const [showTooltip, setShowTooltip] = useState(false);

  function handleMouseEnter(): void {
    setShowTooltip(true);
  }

  function handleMouseLeave(): void {
    setShowTooltip(false);
  }

  return (
    <div
      class="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div class="flex rounded-lg overflow-hidden bg-stone-900 border border-amber-500/10">
        {SCOPE_OPTIONS.map((option) => {
          const isActive = scope === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              class={`px-3 py-1.5 text-xs font-medium transition-all duration-200 cursor-pointer hover:brightness-110 ${
                isActive
                  ? "bg-amber-400/10 text-amber-400"
                  : "bg-transparent text-stone-300"
              } ${option.value === "user" ? "border-r border-amber-500/10" : ""}`}
              title={option.description}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {showTooltip && (
        <div class="absolute top-full left-0 mt-2 w-64 p-3 rounded-lg shadow-xl z-50 bg-stone-800 border border-amber-500/10">
          <div class="text-sm font-medium mb-2 text-stone-100">
            Scope Filter
          </div>
          <div class="space-y-2">
            {SCOPE_OPTIONS.map((option) => (
              <div key={option.value}>
                <span class="text-xs font-semibold text-amber-400">
                  {option.label}:
                </span>
                <span class="text-xs ml-1 text-stone-500">
                  {option.description}
                </span>
              </div>
            ))}
          </div>

          {isLocalMode && (
            <div class="mt-3 pt-2 text-xs border-t border-amber-500/10 text-stone-500">
              <span class="text-blue-400">
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
