/**
 * ActionBar - Groupe de boutons d'action
 *
 * Affiche les actions disponibles dans l'application.
 *
 * @module web/components/landing-v2/molecules/ActionBar
 */

import { ActionButton } from "../atoms/ActionButton.tsx";

interface Action {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  active?: boolean;
}

interface ActionBarProps {
  actions: Action[];
  size?: "sm" | "md";
  class?: string;
}

export function ActionBar({ actions, size = "md", class: className = "" }: ActionBarProps) {
  return (
    <div class={`flex gap-2 ${className}`}>
      {actions.map((action, i) => (
        <ActionButton
          key={i}
          label={action.label}
          variant={action.variant}
          size={size}
          active={action.active}
        />
      ))}
    </div>
  );
}
