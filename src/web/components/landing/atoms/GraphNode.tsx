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

// Namespace colors
const nsColors: Record<string, string> = {
  fs: "#FFB86F",      // Brand gold
  db: "#8b5cf6",      // Purple
  git: "#f97316",     // Orange
  nlp: "#ec4899",     // Pink
  browser: "#06b6d4", // Cyan
  api: "#10b981",     // Emerald
  memory: "#6366f1",  // Indigo
  default: "#6b7280", // Gray
};

export function GraphNode({ data, size = 32 }: GraphNodeProps) {
  const color = nsColors[data.namespace] || nsColors.default;
  const halfSize = size / 2;

  return (
    <g
      class={`gnode ${data.active ? "gnode--active" : ""} ${data.visited ? "gnode--visited" : ""}`}
      transform={`translate(${data.x}, ${data.y})`}
      style={{ "--c": color } as any}
    >
      {/* Glow effect for active nodes */}
      {data.active && (
        <circle
          class="gnode__glow"
          r={halfSize + 8}
          fill={color}
          opacity="0.15"
        />
      )}

      {/* Main circle */}
      <circle
        class="gnode__circle"
        r={halfSize}
        fill="#0a0a0c"
        stroke={color}
        stroke-width={data.active ? 2 : 1}
        opacity={data.visited ? 1 : 0.5}
      />

      {/* Inner dot */}
      <circle
        class="gnode__dot"
        r={4}
        fill={color}
        opacity={data.active ? 1 : 0.6}
      />

      {/* Label */}
      <text
        class="gnode__label"
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
        .gnode {
          transition: transform 0.2s ease;
        }

        .gnode--active {
          transform: scale(1.1);
        }

        .gnode__glow {
          animation: pulse 2s ease-in-out infinite;
        }

        .gnode__circle {
          transition: all 0.3s ease;
        }

        .gnode--active .gnode__circle {
          filter: drop-shadow(0 0 8px var(--c));
        }

        .gnode__dot {
          transition: all 0.3s ease;
        }

        .gnode--active .gnode__dot {
          animation: innerPulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.25; transform: scale(1.1); }
        }

        @keyframes innerPulse {
          0%, 100% { r: 4; }
          50% { r: 6; }
        }
        `}
      </style>
    </g>
  );
}
