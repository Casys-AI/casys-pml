/**
 * Input Atom - Text input with Casys styling
 */

import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";

export type InputType = "text" | "search" | "email" | "password";

export interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  class?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  type?: InputType;
}

const BASE_STYLE = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontFamily: "var(--font-sans)",
};

const BASE_CLASSES = "py-3 px-4 rounded-lg text-sm font-medium outline-none transition-all duration-200 placeholder:opacity-50";

export default function Input({
  value,
  onChange,
  placeholder,
  class: className,
  onFocus,
  onBlur,
  autoFocus,
  type = "text",
}: InputProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  function handleFocus(e: JSX.TargetedFocusEvent<HTMLInputElement>): void {
    e.currentTarget.style.borderColor = "var(--accent)";
    e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-dim)";
    onFocus?.();
  }

  function handleBlur(e: JSX.TargetedFocusEvent<HTMLInputElement>): void {
    e.currentTarget.style.borderColor = "var(--border)";
    e.currentTarget.style.boxShadow = "none";
    onBlur?.();
  }

  function handleInput(e: JSX.TargetedEvent<HTMLInputElement>): void {
    onChange((e.target as HTMLInputElement).value);
  }

  return (
    <input
      ref={inputRef}
      type={type}
      class={`${BASE_CLASSES} ${className || ""}`.trim()}
      style={BASE_STYLE}
      placeholder={placeholder}
      value={value}
      onInput={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
