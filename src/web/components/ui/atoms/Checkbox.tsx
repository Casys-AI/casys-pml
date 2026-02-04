/**
 * Checkbox Atom - Styled checkbox with label
 * Used for: Toggle options, quick filters
 */

import type { JSX } from "preact";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  color?: string;
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      class="w-2.5 h-2.5 text-stone-950"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth="3"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function Checkbox({
  checked,
  onChange,
  label,
  color,
}: CheckboxProps): JSX.Element {
  function handleChange(e: Event): void {
    onChange((e.target as HTMLInputElement).checked);
  }

  // Use amber-500 as default accent color
  const accentColor = color || "#f59e0b";

  return (
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <div
        class={`w-4 h-4 rounded flex items-center justify-center transition-all ${
          checked ? "" : "border-stone-600"
        }`}
        style={{
          backgroundColor: checked ? accentColor : "transparent",
          borderWidth: "1.5px",
          borderStyle: "solid",
          borderColor: checked ? accentColor : undefined,
        }}
      >
        {checked && <CheckIcon />}
      </div>
      <span class="text-sm text-stone-400">{label}</span>
      {/* Hidden native checkbox for accessibility */}
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        class="sr-only"
      />
    </label>
  );
}
