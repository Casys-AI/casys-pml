/**
 * Divider Atom - Gradient separator line
 */

import type { JSX } from "preact";

export interface DividerProps {
  class?: string;
  vertical?: boolean;
}

export default function Divider({
  class: className,
  vertical = false,
}: DividerProps): JSX.Element {
  const direction = vertical ? "to bottom" : "to right";
  const sizeClass = vertical ? "w-px my-2" : "h-px my-3";

  return (
    <div
      class={`${sizeClass} ${className || ""}`.trim()}
      style={{
        background: `linear-gradient(${direction}, transparent, var(--border-strong), transparent)`,
      }}
    />
  );
}
