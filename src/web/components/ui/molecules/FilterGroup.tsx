/**
 * FilterGroup Molecule - Section with title and list of toggleable items
 * Used for: MCP Servers, Edge Types, Confidence filters
 */

import type { JSX } from "preact";

export interface FilterItem {
  id: string;
  label: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  active?: boolean;
}

export interface FilterGroupProps {
  title: string;
  items: FilterItem[];
  onToggle?: (id: string) => void;
  showIndicator?: "dot" | "line" | "none";
}

function DotIndicator({ color }: { color: string }): JSX.Element {
  return (
    <div
      class="w-3 h-3 rounded-full flex-shrink-0 transition-transform hover:scale-125"
      style={{ backgroundColor: color }}
    />
  );
}

function LineIndicator({ color, lineStyle }: { color: string; lineStyle: string }): JSX.Element {
  const isSolid = lineStyle === "solid";

  return (
    <div
      class={`w-6 h-0.5 flex-shrink-0 ${lineStyle === "dotted" ? "opacity-50" : ""}`}
      style={{
        background: isSolid ? color : "transparent",
        borderTop: !isSolid ? `2px ${lineStyle} ${color}` : "none",
      }}
    />
  );
}

export default function FilterGroup({
  title,
  items,
  onToggle,
  showIndicator = "dot",
}: FilterGroupProps): JSX.Element {
  const isClickable = Boolean(onToggle);

  return (
    <section class="mb-4">
      <h3 class="text-xs font-semibold uppercase tracking-widest mb-3 text-stone-500">
        {title}
      </h3>
      {items.map((item) => {
        const color = item.color || "var(--text-dim)";
        const lineStyle = item.lineStyle || "solid";

        return (
          <div
            key={item.id}
            class={`flex items-center gap-2.5 py-1.5 px-3 -mx-3 rounded-lg transition-all duration-200 ${
              item.active === false ? "opacity-35" : ""
            } ${isClickable ? "cursor-pointer hover:bg-amber-400/10" : ""}`}
            onClick={() => onToggle?.(item.id)}
          >
            {showIndicator === "dot" && <DotIndicator color={color} />}
            {showIndicator === "line" && <LineIndicator color={color} lineStyle={lineStyle} />}
            <span class="text-sm text-stone-400">
              {item.label}
            </span>
          </div>
        );
      })}
    </section>
  );
}
