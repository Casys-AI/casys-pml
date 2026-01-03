/**
 * Badge - Atomic component for status/type indicators
 * @module web/components/atoms/Badge
 */

import type { ComponentChildren } from "preact";

interface BadgeProps {
  children: ComponentChildren;
  variant?: "default" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md";
}

export default function Badge({
  children,
  variant = "default",
  size = "sm",
}: BadgeProps) {
  return (
    <>
      <span class={`badge badge--${variant} badge--${size}`}>{children}</span>
      <style>
        {`
        .badge {
          display: inline-flex;
          align-items: center;
          font-weight: 500;
          border-radius: 4px;
          white-space: nowrap;
        }

        .badge--sm {
          font-size: 0.6875rem;
          padding: 0.125rem 0.375rem;
        }

        .badge--md {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
        }

        .badge--default {
          background: rgba(255, 184, 111, 0.1);
          color: #FFB86F;
        }

        .badge--success {
          background: rgba(74, 222, 128, 0.1);
          color: #4ade80;
        }

        .badge--warning {
          background: rgba(251, 191, 36, 0.1);
          color: #fbbf24;
        }

        .badge--error {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
        }

        .badge--info {
          background: rgba(96, 165, 250, 0.1);
          color: #60a5fa;
        }
        `}
      </style>
    </>
  );
}
