/**
 * ActionButton - Bouton d'action dans l'app
 *
 * Bouton interactif pour les actions dans l'application émergente.
 *
 * @module web/components/landing-v2/atoms/ActionButton
 */

interface ActionButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  active?: boolean;
  class?: string;
}

const variantStyles = {
  primary: {
    base: "bg-pml-accent text-stone-900 border-pml-accent",
    hover: "hover:bg-pml-accent/90",
    active: "ring-2 ring-pml-accent/50",
  },
  secondary: {
    base: "bg-transparent text-stone-400 border-white/[0.12]",
    hover: "hover:border-white/[0.2] hover:text-stone-300",
    active: "ring-2 ring-white/20",
  },
  danger: {
    base: "bg-transparent text-red-400 border-red-500/30",
    hover: "hover:bg-red-500/10 hover:border-red-500/50",
    active: "ring-2 ring-red-500/30",
  },
};

const sizeStyles = {
  sm: "py-1.5 px-3 text-[0.7rem]",
  md: "py-2 px-4 text-[0.75rem]",
};

export function ActionButton({
  label,
  variant = "secondary",
  size = "md",
  active = false,
  class: className = "",
}: ActionButtonProps) {
  const style = variantStyles[variant];

  return (
    <button
      type="button"
      class={`
        inline-flex items-center justify-center
        rounded-md border
        font-sans font-medium
        transition-all duration-150
        cursor-pointer
        ${sizeStyles[size]}
        ${style.base}
        ${style.hover}
        ${active ? style.active : ""}
        ${className}
      `.trim()}
    >
      {label}
    </button>
  );
}
