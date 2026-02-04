/**
 * GraphNode - Single node in the hyper graph
 *
 * Represents a tool/capability with namespace coloring.
 * Supports active/inactive states and pulse animations.
 *
 * @module web/components/landing/atoms/GraphNode
 */

export interface GraphNodeData {
  id: string;
  label: string;
  namespace: string;
  x: number;
  y: number;
  active?: boolean;
  visited?: boolean;
}

interface GraphNodeProps {
  data: GraphNodeData;
  size?: number;
}

const nsColors: Record<string, string> = {
  fs: "#FFB86F",
  db: "#8b5cf6",
  git: "#f97316",
  nlp: "#ec4899",
  browser: "#06b6d4",
  api: "#10b981",
  memory: "#6366f1",
  default: "#6b7280",
};

export function GraphNode({ data, size = 32 }: GraphNodeProps) {
  const color = nsColors[data.namespace] || nsColors.default;
  const halfSize = size / 2;

  return (
    <g
      class={`transition-transform duration-200 ${data.active ? "scale-110" : ""}`}
      transform={`translate(${data.x}, ${data.y})`}
    >
      {data.active && (
        <circle
          class="animate-gnode-pulse"
          r={halfSize + 8}
          fill={color}
          opacity="0.15"
        />
      )}

      <circle
        class="transition-all duration-300"
        r={halfSize}
        fill="#0a0a0c"
        stroke={color}
        stroke-width={data.active ? 2 : 1}
        opacity={data.visited ? 1 : 0.5}
        style={data.active ? { filter: `drop-shadow(0 0 8px ${color})` } : undefined}
      />

      <circle
        class={`transition-all duration-300 ${data.active ? "animate-gnode-inner-pulse" : ""}`}
        r={4}
        fill={color}
        opacity={data.active ? 1 : 0.6}
      />

      <text
        y={halfSize + 14}
        text-anchor="middle"
        fill={color}
        font-size="9"
        font-family="'Geist Mono', monospace"
        opacity={data.active ? 1 : 0.6}
      >
        {data.label}
      </text>

      <style>
        {`
        @keyframes gnode-pulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.25; transform: scale(1.1); }
        }
        @keyframes gnode-inner-pulse {
          0%, 100% { r: 4; }
          50% { r: 6; }
        }
        .animate-gnode-pulse {
          animation: gnode-pulse 2s ease-in-out infinite;
        }
        .animate-gnode-inner-pulse {
          animation: gnode-inner-pulse 1s ease-in-out infinite;
        }
        `}
      </style>
    </g>
  );
}
