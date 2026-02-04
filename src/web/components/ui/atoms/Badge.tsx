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

  const baseClasses =
    "flex items-center gap-2.5 py-2 px-3 -mx-3 rounded-lg transition-all duration-200";
  const activeClass = active ? "" : "opacity-35";
  const clickableClass = isClickable ? "cursor-pointer hover:bg-amber-500/20" : "";
  const combinedClasses =
    `${baseClasses} ${activeClass} ${clickableClass} ${className || ""}`.trim();

  return (
    <div class={combinedClasses} onClick={onClick}>
      <div
        class="w-3 h-3 rounded-full transition-all duration-200 hover:scale-125 flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {label && <span class="text-sm font-medium text-stone-400">{label}</span>}
    </div>
  );
}
