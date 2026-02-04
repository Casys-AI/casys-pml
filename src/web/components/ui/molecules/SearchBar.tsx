/**
 * SearchBar Molecule - Input with keyboard shortcut indicator
 * Combines: Input + Kbd atoms
 */

import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import Kbd from "../atoms/Kbd.tsx";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  shortcut?: string;
  class?: string;
}

function isShortcutTrigger(e: KeyboardEvent): boolean {
  const isSlashKey = e.key === "/" && !e.ctrlKey && document.activeElement?.tagName !== "INPUT";
  const isCtrlK = e.ctrlKey && e.key === "k";
  return isSlashKey || isCtrlK;
}

export default function SearchBar({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder = "Search...",
  shortcut = "/",
  class: className,
}: SearchBarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (isShortcutTrigger(e)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleInput(e: JSX.TargetedEvent<HTMLInputElement>): void {
    onChange((e.target as HTMLInputElement).value);
  }

  return (
    <div class={`relative ${className || ""}`.trim()}>
      <input
        ref={inputRef}
        type="text"
        class="w-full py-3 px-4 pr-12 rounded-xl text-sm font-medium outline-none transition-all duration-200 placeholder:opacity-50 bg-stone-900 border border-amber-500/10 text-stone-100 font-sans focus:border-pml-accent focus:ring-2 focus:ring-pml-accent/20"
        placeholder={placeholder}
        value={value}
        onInput={handleInput}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <span class="absolute right-3 top-1/2 -translate-y-1/2">
        <Kbd>{shortcut}</Kbd>
      </span>
    </div>
  );
}
