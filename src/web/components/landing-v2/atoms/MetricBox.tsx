/**
 * MetricBox - Boîte affichant une métrique
 *
 * Affiche une valeur avec son label (ex: "v2.1.0" / "current version")
 *
 * @module web/components/landing-v2/atoms/MetricBox
 */

interface MetricBoxProps {
  value: string;
  label: string;
  variant?: "default" | "success" | "warning" | "accent";
  class?: string;
}

const variantStyles = {
  default: {
    bg: "bg-white/[0.04]",
    border: "border-white/[0.08]",
    value: "text-stone-200",
  },
  success: {
    bg: "bg-green-500/[0.08]",
    border: "border-green-500/20",
    value: "text-green-400",
  },
  warning: {
    bg: "bg-orange-500/[0.08]",
    border: "border-orange-500/20",
    value: "text-orange-400",
  },
  accent: {
    bg: "bg-pml-accent/[0.08]",
    border: "border-pml-accent/20",
    value: "text-pml-accent",
  },
};

export function MetricBox({
  value,
  label,
  variant = "default",
  class: className = "",
}: MetricBoxProps) {
  const style = variantStyles[variant];

  return (
    <div
      class={`
        flex flex-col items-center justify-center
        py-2.5 px-4
        rounded-lg border
        ${style.bg}
        ${style.border}
        ${className}
      `.trim()}
    >
      <span class={`font-mono text-[0.9rem] font-semibold ${style.value}`}>
        {value}
      </span>
      <span class="font-sans text-[0.65rem] text-stone-500 mt-0.5">
        {label}
      </span>
    </div>
  );
}
