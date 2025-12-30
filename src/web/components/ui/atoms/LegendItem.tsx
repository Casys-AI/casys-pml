/**
 * LegendItem Atom
 *
 * A colored dot with label and value for chart legends.
 * Used in EmergencePanel for entropy metric display.
 *
 * @module web/components/ui/atoms/LegendItem
 */

interface LegendItemProps {
  /** Color of the legend dot */
  color: string;
  /** Label text */
  label: string;
  /** Value to display (can be number or string like "N/A") */
  value: string | number;
  /** Whether this is the primary/emphasized item */
  primary?: boolean;
}

export function LegendItem({ color, label, value, primary = false }: LegendItemProps) {
  return (
    <div class="flex items-center gap-1.5">
      <span
        class="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <span style={{ color: "var(--text-dim)" }}>{label}:</span>
      <span
        style={{
          color,
          fontWeight: primary ? 600 : 400,
        }}
      >
        {typeof value === "number" ? value.toFixed(3) : value}
      </span>
    </div>
  );
}

export default LegendItem;
