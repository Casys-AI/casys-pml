/**
 * AppCard - Container de l'application qui apparaît
 *
 * C'est le cadre visuel de l'app qui émerge dans le chat.
 * Style distinct pour montrer que c'est une vraie application.
 *
 * @module web/components/landing-v2/atoms/AppCard
 */

import type { ComponentChildren } from "preact";

interface AppCardProps {
  children: ComponentChildren;
  class?: string;
}

export function AppCard({ children, class: className = "" }: AppCardProps) {
  return (
    <div
      class={`
        relative overflow-hidden
        rounded-xl
        bg-white/[0.03]
        border border-pml-accent/20
        shadow-lg shadow-black/20
        ${className}
      `.trim()}
    >
      {/* Subtle glow effect on top */}
      <div
        class="absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,184,111,0.3), transparent)",
        }}
      />
      {children}
    </div>
  );
}
