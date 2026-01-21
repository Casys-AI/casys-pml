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
  success: { color: "#4ade80", icon: "✓", label: "Success" },
  running: { color: "#60a5fa", icon: "◉", label: "Running" },
  pending: { color: "#a8a29e", icon: "○", label: "Pending" },
  error: { color: "#f87171", icon: "✗", label: "Error" },
};

export function StatusBadge({ status, label, compact = false }: StatusBadgeProps) {
  const config = statusConfig[status];
  const displayLabel = label || config.label;

  return (
    <span
      class={`status-badge status-badge--${status} ${compact ? "status-badge--compact" : ""}`}
      style={{ "--status-color": config.color } as any}
    >
      <span class="status-badge__dot" />
      {!compact && <span class="status-badge__label">{displayLabel}</span>}

      <style>
        {`
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          color: var(--status-color);
        }

        .status-badge--compact {
          gap: 0;
        }

        .status-badge__dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--status-color);
        }

        .status-badge--running .status-badge__dot,
        .status-badge--success .status-badge__dot {
          animation: statusPulse 2s ease-in-out infinite;
        }

        .status-badge__label {
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        @keyframes statusPulse {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        `}
      </style>
    </span>
  );
}
