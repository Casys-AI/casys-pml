/**
 * LegendItem Molecule - Single legend entry with line indicator
 * Used for: Edge types and confidence legends
 */

interface LegendItemProps {
  label: string;
  color: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  opacity?: number;
}

export default function LegendItem({
  label,
  color,
  lineStyle = "solid",
  opacity = 1,
}: LegendItemProps) {
  return (
    <div class="flex items-center gap-2.5 py-1.5 px-3 -mx-3">
      <div
        class="w-6 h-0.5 flex-shrink-0"
        style={{
          background: lineStyle === "solid" ? color : "transparent",
          borderTop: lineStyle !== "solid" ? `2px ${lineStyle} ${color}` : "none",
          opacity,
        }}
      />
      <span class="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );
}
