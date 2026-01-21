/**
 * GraphEdge - Edge connecting two nodes
 *
 * Supports regular edges and animated path particles.
 *
 * @module web/components/landing/atoms/GraphEdge
 */

export interface GraphEdgeData {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  active?: boolean;
  pathId?: number; // For path animation timing
}

interface GraphEdgeProps {
  data: GraphEdgeData;
  color?: string;
}

export function GraphEdge({ data, color = "#333" }: GraphEdgeProps) {
  const { from, to, active, pathId } = data;

  return (
    <g class={`gedge ${active ? "gedge--active" : ""}`}>
      {/* Base edge line */}
      <line
        class="gedge__line"
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={active ? color : "#222"}
        stroke-width={active ? 2 : 1}
        opacity={active ? 0.8 : 0.3}
      />

      {/* Animated particle for active paths */}
      {active && (
        <circle
          class="gedge__particle"
          r="3"
          fill={color}
          style={{ "--delay": `${(pathId || 0) * 0.1}s` } as any}
        >
          <animateMotion
            dur="1.5s"
            repeatCount="indefinite"
            begin={`${(pathId || 0) * 0.15}s`}
          >
            <mpath href={`#path-${data.id}`} />
          </animateMotion>
        </circle>
      )}

      {/* Hidden path for animateMotion */}
      {active && (
        <path
          id={`path-${data.id}`}
          d={`M${from.x},${from.y} L${to.x},${to.y}`}
          fill="none"
          stroke="none"
        />
      )}

      <style>
        {`
        .gedge__line {
          transition: all 0.4s ease;
        }

        .gedge--active .gedge__line {
          filter: drop-shadow(0 0 4px ${color});
        }

        .gedge__particle {
          filter: drop-shadow(0 0 6px ${color});
        }
        `}
      </style>
    </g>
  );
}
