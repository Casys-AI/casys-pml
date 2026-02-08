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
  pathId?: number;
}

interface GraphEdgeProps {
  data: GraphEdgeData;
  color?: string;
}

export function GraphEdge({ data, color = "#333" }: GraphEdgeProps) {
  const { from, to, active, pathId } = data;

  return (
    <g>
      <line
        class="transition-all duration-400"
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={active ? color : "#222"}
        stroke-width={active ? 2 : 1}
        opacity={active ? 0.8 : 0.3}
        style={active ? { filter: `drop-shadow(0 0 4px ${color})` } : undefined}
      />

      {active && (
        <circle
          r="3"
          fill={color}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
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

      {active && (
        <path
          id={`path-${data.id}`}
          d={`M${from.x},${from.y} L${to.x},${to.y}`}
          fill="none"
          stroke="none"
        />
      )}
    </g>
  );
}
