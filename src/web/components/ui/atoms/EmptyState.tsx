/**
 * EmptyState - Reusable empty state component for dashboard panels
 *
 * Shows a welcoming message with optional action button when no data is available.
 *
 * @module web/components/ui/atoms/EmptyState
 */

import type { ComponentChildren, JSX } from "preact";

export interface EmptyStateAction {
  label: string;
  href: string;
  icon?: ComponentChildren;
}

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: EmptyStateAction;
}

const CONTAINER_STYLE = {
  background: "var(--bg-elevated, #12110f)",
  border: "1px solid var(--border)",
};

const BUTTON_STYLE = {
  background: "var(--accent, #FFB86F)",
  color: "var(--bg, #08080a)",
};

export function EmptyState({
  icon = "\uD83D\uDE80",
  title,
  description,
  action,
}: EmptyStateProps): JSX.Element {
  return (
    <div class="w-full h-full flex items-center justify-center p-6">
      <div class="text-center p-8 rounded-xl max-w-md" style={CONTAINER_STYLE}>
        <div class="text-5xl mb-4">{icon}</div>
        <h3 class="text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>
          {title}
        </h3>
        <p class="mb-6" style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>
          {description}
        </p>
        {action && (
          <a
            href={action.href}
            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all hover:brightness-110"
            style={BUTTON_STYLE}
          >
            {action.icon}
            {action.label}
          </a>
        )}
      </div>
    </div>
  );
}

function KeyIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

export function WelcomeEmptyState(): JSX.Element {
  return (
    <EmptyState
      icon={"\uD83D\uDE80"}
      title="Welcome to Casys PML!"
      description="No capabilities yet. Get your API key to start discovering and creating capabilities."
      action={{
        label: "Get your API Key",
        href: "/dashboard/settings",
        icon: <KeyIcon />,
      }}
    />
  );
}
