/**
 * StatusBadge - Live status indicator
 *
 * Shows execution status with a pulsing dot.
 *
 * @module web/components/landing/atoms/StatusBadge
 */

interface StatusBadgeProps {
  status: "success" | "running" | "pending" | "error";
  label?: string;
  compact?: boolean;
}

const statusConfig = {
  success: { color: "text-green-400", dotColor: "bg-green-400", label: "Success", pulse: true },
  running: { color: "text-blue-400", dotColor: "bg-blue-400", label: "Running", pulse: true },
  pending: { color: "text-stone-400", dotColor: "bg-stone-400", label: "Pending", pulse: false },
  error: { color: "text-red-400", dotColor: "bg-red-400", label: "Error", pulse: false },
};

export function StatusBadge({ status, label, compact = false }: StatusBadgeProps) {
  const config = statusConfig[status];
  const displayLabel = label || config.label;

  return (
    <span
      class={`inline-flex items-center font-mono text-[0.7rem] ${config.color} ${compact ? "gap-0" : "gap-1.5"}`}
    >
      <span
        class={`w-1.5 h-1.5 rounded-full ${config.dotColor} ${config.pulse ? "animate-pulse" : ""}`}
      />
      {!compact && (
        <span class="uppercase tracking-wide">{displayLabel}</span>
      )}
    </span>
  );
}
