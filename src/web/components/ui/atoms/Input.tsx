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

const BASE_CLASSES =
  "py-3 px-4 rounded-lg text-sm font-medium outline-none transition-all duration-200 " +
  "bg-stone-900 border border-stone-700 text-stone-100 font-sans " +
  "placeholder:text-stone-500 placeholder:opacity-50 " +
  "focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20";

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

  function handleFocus(): void {
    onFocus?.();
  }

  function handleBlur(): void {
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
      placeholder={placeholder}
      value={value}
      onInput={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
