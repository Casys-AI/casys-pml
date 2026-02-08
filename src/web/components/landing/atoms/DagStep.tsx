/**
 * DagStep - A single step in the DAG visualization
 *
 * Shows tool name, execution time, and status with color coding.
 *
 * @module web/components/landing/atoms/DagStep
 */

interface DagStepProps {
  name: string;
  time: number;
  success: boolean;
  color: string;
  isLast?: boolean;
}

export function DagStep({ name, time, success, color, isLast }: DagStepProps) {
  return (
    <div
      class="group relative flex flex-col items-center gap-1 py-3 px-4 bg-stone-950 border rounded-lg min-w-[110px] transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor: color,
        boxShadow: isLast ? `inset 0 0 20px ${color}15` : undefined,
        background: isLast ? `linear-gradient(135deg, ${color}10 0%, #0c0a09 100%)` : undefined,
      }}
    >
      <span
        class="font-mono text-xs font-medium"
        style={{ color }}
      >
        {name}
      </span>
      <span class="font-mono text-[0.65rem] text-green-400">
        {success ? "✓" : "✗"} {time}ms
      </span>

      <style>
        {`
        .group:hover {
          box-shadow: 0 4px 12px ${color}30;
        }
        `}
      </style>
    </div>
  );
}
