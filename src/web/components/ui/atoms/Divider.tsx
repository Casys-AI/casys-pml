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
  const baseClass = vertical
    ? "w-px my-2 bg-gradient-to-b from-transparent via-stone-600 to-transparent"
    : "h-px my-3 bg-gradient-to-r from-transparent via-stone-600 to-transparent";

  return <div class={`${baseClass} ${className || ""}`.trim()} />;
}
