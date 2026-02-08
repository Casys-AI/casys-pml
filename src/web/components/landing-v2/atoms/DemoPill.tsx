/**
 * DemoPill - Bouton de sélection de use-case
 *
 * Pill avec icône + label pour naviguer entre les démos.
 *
 * @module web/components/landing-v2/atoms/DemoPill
 */

interface DemoPillProps {
  icon: string;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  class?: string;
}

export function DemoPill({
  icon,
  label,
  isActive = false,
  onClick,
  class: className = "",
}: DemoPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`
        inline-flex items-center gap-1.5
        py-1.5 px-3
        rounded-md
        font-mono text-[0.65rem]
        border
        transition-all duration-200
        cursor-pointer
        ${isActive
          ? "text-pml-accent border-pml-accent/30 bg-pml-accent/10"
          : "text-stone-500 border-transparent bg-transparent hover:text-stone-400 hover:bg-white/[0.02]"
        }
        ${className}
      `.trim()}
    >
      <span class="text-sm">{icon}</span>
      <span class="hidden sm:inline">{label}</span>
    </button>
  );
}
