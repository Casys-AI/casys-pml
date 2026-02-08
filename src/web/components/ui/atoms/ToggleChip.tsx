/**
 * ToggleChip Atom - Toggleable filter chip with color support
 * Used for: Category filters, type filters, tag selection
 */

interface ToggleChipProps {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}

export default function ToggleChip({
  label,
  active,
  color,
  onClick,
}: ToggleChipProps) {
  // Use amber-500 as default accent color
  const accentColor = color || "#f59e0b";

  // When active: tinted background with accent border and text
  // When inactive: elevated bg with muted border and text, hover shows accent tint
  const baseClasses =
    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200";

  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        class={baseClasses}
        style={{
          backgroundColor: `${accentColor}20`,
          border: `1px solid ${accentColor}`,
          color: accentColor,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      class={`${baseClasses} bg-stone-800 border border-stone-700 text-stone-400 hover:border-amber-500/60`}
    >
      {label}
    </button>
  );
}
