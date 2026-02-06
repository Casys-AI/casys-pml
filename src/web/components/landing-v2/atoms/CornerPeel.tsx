/**
 * CornerPeel - Coin écorné cliquable pour révéler le code
 *
 * Triangle plié en haut à droite avec icône </>.
 * Hover = légère élévation, Clic = déclenche le flip.
 *
 * @module web/components/landing-v2/atoms/CornerPeel
 */

interface CornerPeelProps {
  onClick?: () => void;
  isFlipped?: boolean;
  class?: string;
}

export function CornerPeel({ onClick, isFlipped = false, class: className = "" }: CornerPeelProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`
        absolute top-0 right-0 z-20
        w-12 h-12
        cursor-pointer
        group
        ${className}
      `.trim()}
      aria-label={isFlipped ? "Show dashboard" : "Show code"}
      title={isFlipped ? "Back to dashboard" : "See the code"}
    >
      {/* Triangle plié */}
      <div
        class="
          absolute top-0 right-0
          w-0 h-0
          border-solid
          border-t-0 border-l-0
          border-r-[40px] border-b-[40px]
          border-r-[#1a1a1c] border-b-transparent
          transition-all duration-200
          group-hover:border-r-[48px] group-hover:border-b-[48px]
          drop-shadow-[-2px_2px_4px_rgba(0,0,0,0.4)]
        "
      />

      {/* Icon </> */}
      <span
        class="
          absolute top-1.5 right-1.5
          font-mono text-[9px] font-medium
          text-pml-accent/60
          transition-all duration-200
          group-hover:text-pml-accent
          group-hover:top-2 group-hover:right-2
        "
      >
        {isFlipped ? "UI" : "</>"}
      </span>
    </button>
  );
}
