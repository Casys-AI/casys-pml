/**
 * GraphNode3D - 3D node atom for hyper-graph
 *
 * A node in the knowledge graph with Z-depth for 3D effect.
 * Uses CSS transforms for perspective positioning.
 *
 * @module web/components/landing/atoms/GraphNode3D
 */

export interface GraphNode3DProps {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number; // depth layer (0 = front, higher = back)
  color: string;
  isActive?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { r: 4, font: 7, ring: 10 },
  md: { r: 5, font: 8, ring: 12 },
  lg: { r: 7, font: 9, ring: 16 },
};

export function GraphNode3D({
  id,
  label,
  x,
  y,
  z,
  color,
  isActive = false,
  size = "md",
}: GraphNode3DProps) {
  const s = sizes[size];
  // Z affects opacity and scale for depth illusion
  const depthScale = 1 - z * 0.15;
  const depthOpacity = 1 - z * 0.2;

  return (
    <g
      class={`gn3d ${isActive ? "gn3d--active" : ""}`}
      data-id={id}
      style={`--depth-scale: ${depthScale}; --depth-opacity: ${depthOpacity};`}
    >
      {/* Outer ring for active nodes */}
      {isActive && (
        <circle
          cx={x}
          cy={y}
          r={s.ring}
          fill="none"
          stroke={color}
          stroke-width="1"
          opacity={0.3 * depthOpacity}
          class="gn3d__ring"
        />
      )}

      {/* Glow effect for active */}
      {isActive && (
        <circle
          cx={x}
          cy={y}
          r={s.r + 2}
          fill={color}
          opacity={0.15 * depthOpacity}
          class="gn3d__glow"
        />
      )}

      {/* Main dot */}
      <circle
        cx={x}
        cy={y}
        r={s.r * depthScale}
        fill={isActive ? color : "#1a1a1a"}
        stroke={color}
        stroke-width={1.5 * depthScale}
        opacity={depthOpacity}
        class="gn3d__dot"
      />

      {/* Label */}
      <text
        x={x}
        y={y + s.r + 12}
        fill={color}
        font-size={s.font * depthScale}
        font-family="'Geist Mono', monospace"
        text-anchor="middle"
        opacity={(isActive ? 1 : 0.6) * depthOpacity}
        class="gn3d__label"
      >
        {label}
      </text>

      <style>
        {`
        .gn3d__ring {
          animation: gn3dPulse 3s ease-in-out infinite;
        }

        .gn3d--active .gn3d__dot {
          filter: drop-shadow(0 0 4px var(--node-color, currentColor));
        }

        @keyframes gn3dPulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 0.15; }
        }
        `}
      </style>
    </g>
  );
}
