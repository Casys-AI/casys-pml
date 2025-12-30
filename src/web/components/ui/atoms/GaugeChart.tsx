/**
 * GaugeChart - Semi-circular gauge visualization
 *
 * Displays a value between 0-1 as a half-circle gauge with needle.
 * Used for speculation accuracy and other percentage metrics.
 *
 * @module web/components/ui/atoms/GaugeChart
 */

interface GaugeChartProps {
  /** Value between 0 and 1 */
  value: number;
  /** Label text below the gauge */
  label: string;
  /** Color for the filled arc portion */
  color: string;
}

/**
 * Semi-circular gauge chart with animated needle
 */
export function GaugeChart({ value, label, color }: GaugeChartProps) {
  const percentage = Math.round(value * 100);
  const rotation = value * 180 - 90; // -90 to 90 degrees

  return (
    <div class="flex flex-col items-center">
      <div class="relative w-24 h-12 overflow-hidden">
        {/* Background arc */}
        <div
          class="absolute w-24 h-24 rounded-full"
          style={{
            background: `conic-gradient(
              ${color} 0deg,
              ${color} ${value * 180}deg,
              var(--bg-surface, #1a1816) ${value * 180}deg,
              var(--bg-surface, #1a1816) 180deg,
              transparent 180deg
            )`,
            transform: "rotate(-90deg)",
            clipPath: "inset(0 0 50% 0)",
          }}
        />
        {/* Center cutout */}
        <div
          class="absolute top-2 left-2 w-20 h-20 rounded-full"
          style={{ background: "var(--bg-elevated, #12110f)" }}
        />
        {/* Needle */}
        <div
          class="absolute bottom-0 left-1/2 w-0.5 h-10 origin-bottom"
          style={{
            background: "var(--text, #f5f0e8)",
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            transition: "transform 0.5s ease-out",
          }}
        />
        {/* Center dot */}
        <div
          class="absolute bottom-0 left-1/2 w-2 h-2 rounded-full -translate-x-1/2 translate-y-1/2"
          style={{ background: "var(--text, #f5f0e8)" }}
        />
      </div>
      <div class="text-lg font-bold mt-1" style={{ color }}>
        {percentage}%
      </div>
      <div class="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

export default GaugeChart;
