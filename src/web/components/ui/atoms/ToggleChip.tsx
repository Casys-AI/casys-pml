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
  color = "var(--accent)",
  onClick,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
      style={{
        background: active ? `${color}20` : "var(--bg-elevated)",
        border: `1px solid ${active ? color : "var(--border)"}`,
        color: active ? color : "var(--text-muted)",
      }}
      onMouseOver={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = `${color}60`;
        }
      }}
      onMouseOut={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "var(--border)";
        }
      }}
    >
      {label}
    </button>
  );
}
