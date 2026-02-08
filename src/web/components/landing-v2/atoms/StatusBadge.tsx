/**
 * StatusBadge - Badge de statut
 *
 * Affiche un statut avec couleur (healthy, warning, error, pending).
 *
 * @module web/components/landing-v2/atoms/StatusBadge
 */

export type StatusBadgeVariant = "healthy" | "warning" | "error" | "pending";

interface StatusBadgeProps {
  status: StatusBadgeVariant;
  label?: string;
  class?: string;
}

const variantStyles: Record<StatusBadgeVariant, { bg: string; text: string; dot: string }> = {
  healthy: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    dot: "bg-green-500",
  },
  warning: {
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    dot: "bg-orange-500",
  },
  error: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    dot: "bg-red-500",
  },
  pending: {
    bg: "bg-stone-500/10",
    text: "text-stone-400",
    dot: "bg-stone-500 animate-pulse",
  },
};

const defaultLabels: Record<StatusBadgeVariant, string> = {
  healthy: "Healthy",
  warning: "Warning",
  error: "Error",
  pending: "Pending",
};

export function StatusBadge({
  status,
  label,
  class: className = "",
}: StatusBadgeProps) {
  const style = variantStyles[status];
  const displayLabel = label || defaultLabels[status];

  return (
    <span
      class={`
        inline-flex items-center gap-1.5
        py-1 px-2
        rounded-full
        font-mono text-[0.65rem] font-medium
        ${style.bg}
        ${style.text}
        ${className}
      `.trim()}
    >
      <span class={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {displayLabel}
    </span>
  );
}
