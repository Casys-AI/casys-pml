/**
 * DagArrow - Connection arrow between DAG steps
 *
 * Horizontal or vertical arrow with gradient animation.
 *
 * @module web/components/landing/atoms/DagArrow
 */

interface DagArrowProps {
  direction?: "right" | "down";
  animated?: boolean;
}

export function DagArrow({ direction = "right", animated = true }: DagArrowProps) {
  if (direction === "down") {
    return (
      <div class="flex justify-center">
        <svg
          viewBox="0 0 12 32"
          class="w-3 h-8"
        >
          <defs>
            <linearGradient id="arrowGradV" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFB86F" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#FFB86F" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <path
            d="M6 0 L6 26 M2 22 L6 26 L10 22"
            stroke="url(#arrowGradV)"
            strokeWidth="1.5"
            fill="none"
            class={animated ? "animate-draw-arrow-v" : ""}
            style={animated ? { strokeDasharray: 40, strokeDashoffset: 0 } : undefined}
          />
        </svg>

        <style>
          {`
          @keyframes draw-arrow-v {
            from { stroke-dashoffset: 40; }
            to { stroke-dashoffset: 0; }
          }
          .animate-draw-arrow-v {
            stroke-dasharray: 40;
            animation: draw-arrow-v 1.5s ease forwards;
          }
          `}
        </style>
      </div>
    );
  }

  return (
    <div class="flex items-center">
      <svg
        viewBox="0 0 24 12"
        class="w-6 h-3"
      >
        <defs>
          <linearGradient id="arrowGradH" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFB86F" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#FFB86F" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        <path
          d="M0 6 L18 6 M14 2 L18 6 L14 10"
          stroke="url(#arrowGradH)"
          strokeWidth="1.5"
          fill="none"
          class={animated ? "animate-draw-arrow-h" : ""}
          style={animated ? { strokeDasharray: 30, strokeDashoffset: 0 } : undefined}
        />
      </svg>

      <style>
        {`
        @keyframes draw-arrow-h {
          from { stroke-dashoffset: 30; }
          to { stroke-dashoffset: 0; }
        }
        .animate-draw-arrow-h {
          stroke-dasharray: 30;
          animation: draw-arrow-h 1.5s ease forwards;
        }
        `}
      </style>
    </div>
  );
}
