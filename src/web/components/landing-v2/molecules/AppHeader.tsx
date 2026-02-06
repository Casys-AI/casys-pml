/**
 * AppHeader - Header de l'application émergente
 *
 * Icône + titre + badge de statut.
 *
 * @module web/components/landing-v2/molecules/AppHeader
 */

import { StatusBadge, type StatusBadgeVariant } from "../atoms/StatusBadge.tsx";

interface AppHeaderProps {
  icon: string; // emoji ou texte
  title: string;
  status?: StatusBadgeVariant;
  statusLabel?: string;
  class?: string;
}

export function AppHeader({
  icon,
  title,
  status,
  statusLabel,
  class: className = "",
}: AppHeaderProps) {
  return (
    <div
      class={`
        flex items-center justify-between
        py-2.5 px-4
        bg-pml-accent/[0.06]
        border-b border-pml-accent/10
        ${className}
      `.trim()}
    >
      <div class="flex items-center gap-2">
        <span class="text-base">{icon}</span>
        <span class="font-sans text-[0.85rem] font-semibold text-stone-200">
          {title}
        </span>
      </div>

      {status && <StatusBadge status={status} label={statusLabel} />}
    </div>
  );
}
