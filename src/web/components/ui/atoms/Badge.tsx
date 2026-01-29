/**
 * Badge Atom - Colored indicator dot with optional label
 * Used for: MCP server indicators, status badges
 */

import type { JSX } from "preact";

export interface BadgeProps {
  color: string;
  label?: string;
  active?: boolean;
  onClick?: () => void;
  class?: string;
}

export default function Badge({
  color,
  label,
  active = true,
  onClick,
  class: className,
}: BadgeProps): JSX.Element {
  const isClickable = Boolean(onClick);

  function handleMouseOver(e: MouseEvent): void {
    if (isClickable) {
      (e.currentTarget as HTMLElement).style.background = "var(--accent-dim)";
    }
  }

  function handleMouseOut(e: MouseEvent): void {
    if (isClickable) {
      (e.currentTarget as HTMLElement).style.background = "transparent";
    }
  }

  const baseClasses = "flex items-center gap-2.5 py-2 px-3 -mx-3 rounded-lg transition-all duration-200";
  const activeClass = active ? "" : "opacity-35";
  const clickableClass = isClickable ? "cursor-pointer" : "";
  const combinedClasses = `${baseClasses} ${activeClass} ${clickableClass} ${className || ""}`.trim();

  return (
    <div
      class={combinedClasses}
      onClick={onClick}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <div
        class="w-3 h-3 rounded-full transition-all duration-200 hover:scale-125 flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {label && (
        <span class="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      )}
    </div>
  );
}
