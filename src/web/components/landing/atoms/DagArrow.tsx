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
      <div class={`dag-arrow dag-arrow--down ${animated ? "dag-arrow--animated" : ""}`}>
        <svg viewBox="0 0 12 32">
          <defs>
            <linearGradient id="arrowGradV" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFB86F" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#FFB86F" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <path d="M6 0 L6 26 M2 22 L6 26 L10 22" stroke="url(#arrowGradV)" strokeWidth="1.5" fill="none" />
        </svg>

        <style>
          {`
          .dag-arrow--down {
            display: flex;
            justify-content: center;
          }
          .dag-arrow--down svg {
            width: 12px;
            height: 32px;
          }
          .dag-arrow--down.dag-arrow--animated svg path {
            stroke-dasharray: 40;
            stroke-dashoffset: 40;
            animation: drawArrowV 1.5s ease forwards;
          }
          @keyframes drawArrowV {
            to { stroke-dashoffset: 0; }
          }
          `}
        </style>
      </div>
    );
  }

  return (
    <div class={`dag-arrow dag-arrow--right ${animated ? "dag-arrow--animated" : ""}`}>
      <svg viewBox="0 0 24 12">
        <defs>
          <linearGradient id="arrowGradH" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFB86F" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#FFB86F" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        <path d="M0 6 L18 6 M14 2 L18 6 L14 10" stroke="url(#arrowGradH)" strokeWidth="1.5" fill="none" />
      </svg>

      <style>
        {`
        .dag-arrow--right {
          display: flex;
          align-items: center;
        }
        .dag-arrow--right svg {
          width: 24px;
          height: 12px;
        }
        .dag-arrow--right.dag-arrow--animated svg path {
          stroke-dasharray: 30;
          stroke-dashoffset: 30;
          animation: drawArrowH 1.5s ease forwards;
        }
        @keyframes drawArrowH {
          to { stroke-dashoffset: 0; }
        }
        `}
      </style>
    </div>
  );
}
