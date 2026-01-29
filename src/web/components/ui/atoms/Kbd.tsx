/**
 * Kbd Atom - Keyboard shortcut indicator
 * Used for: Displaying keyboard shortcuts like /, Esc, Ctrl+K
 */

import type { JSX } from "preact";

export interface KbdProps {
  children: string;
  class?: string;
}

const KBD_STYLE = {
  background: "var(--accent-dim)",
  border: "1px solid var(--border)",
  color: "var(--text-dim)",
  fontFamily: "var(--font-mono)",
};

export default function Kbd({
  children,
  class: className,
}: KbdProps): JSX.Element {
  return (
    <kbd
      class={`px-2 py-0.5 rounded-md text-xs font-medium ${className || ""}`.trim()}
      style={KBD_STYLE}
    >
      {children}
    </kbd>
  );
}
