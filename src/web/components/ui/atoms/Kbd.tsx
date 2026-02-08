/**
 * Kbd Atom - Keyboard shortcut indicator
 * Used for: Displaying keyboard shortcuts like /, Esc, Ctrl+K
 */

import type { JSX } from "preact";

export interface KbdProps {
  children: string;
  class?: string;
}

export default function Kbd({
  children,
  class: className,
}: KbdProps): JSX.Element {
  return (
    <kbd
      class={`px-2 py-0.5 rounded-md text-xs font-medium font-mono bg-amber-500/10 border border-stone-700 text-stone-500 ${className || ""}`.trim()}
    >
      {children}
    </kbd>
  );
}
