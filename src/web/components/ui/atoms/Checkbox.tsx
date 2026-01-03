/**
 * Checkbox Atom - Styled checkbox with label
 * Used for: Toggle options, quick filters
 */

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  color?: string;
}

export default function Checkbox({
  checked,
  onChange,
  label,
  color = "var(--accent)",
}: CheckboxProps) {
  return (
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <div
        class="w-4 h-4 rounded flex items-center justify-center transition-all"
        style={{
          background: checked ? color : "transparent",
          border: `1.5px solid ${checked ? color : "var(--border-strong)"}`,
        }}
      >
        {checked && (
          <svg
            class="w-2.5 h-2.5"
            style={{ color: "var(--bg)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="3"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span class="text-sm" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {/* Hidden native checkbox for accessibility */}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
        class="sr-only"
      />
    </label>
  );
}
