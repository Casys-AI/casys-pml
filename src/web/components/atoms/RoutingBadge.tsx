/**
 * RoutingBadge - Shows local/cloud routing indicator
 * @module web/components/atoms/RoutingBadge
 */

interface RoutingBadgeProps {
  routing: "local" | "cloud";
  showLabel?: boolean;
}

export default function RoutingBadge({ routing, showLabel = true }: RoutingBadgeProps) {
  const isCloud = routing === "cloud";

  return (
    <>
      <span class={`routing-badge routing-badge--${routing}`}>
        {isCloud ? "☁️" : "💻"}
        {showLabel && <span class="routing-badge-label">{isCloud ? "Cloud" : "Local"}</span>}
      </span>
      <style>
        {`
        .routing-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
        }

        .routing-badge--local {
          color: #6b6560;
        }

        .routing-badge--cloud {
          color: #60a5fa;
        }

        .routing-badge-label {
          font-size: 0.6875rem;
        }
        `}
      </style>
    </>
  );
}
