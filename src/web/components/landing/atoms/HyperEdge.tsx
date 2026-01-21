/**
 * HyperEdge - Connects multiple nodes in a hyper-graph
 *
 * Represented as a curved region/blob connecting 3+ nodes.
 * Shows capability clusters and learned patterns.
 *
 * @module web/components/landing/atoms/HyperEdge
 */

export interface HyperEdgeData {
  id: string;
  nodes: Array<{ x: number; y: number }>;
  color: string;
  label?: string;
  active?: boolean;
}

interface HyperEdgeProps {
  data: HyperEdgeData;
}

// Generate a smooth blob path through points
function generateBlobPath(points: Array<{ x: number; y: number }>, padding = 25): string {
  if (points.length < 3) return "";

  // Calculate centroid
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  // Sort points by angle from centroid for proper polygon
  const sorted = [...points].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  // Expand points outward from centroid
  const expanded = sorted.map(p => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = (dist + padding) / dist;
    return {
      x: cx + dx * scale,
      y: cy + dy * scale,
    };
  });

  // Generate smooth curve through expanded points
  const n = expanded.length;
  let path = `M${expanded[0].x},${expanded[0].y}`;

  for (let i = 0; i < n; i++) {
    const p0 = expanded[i];
    const p1 = expanded[(i + 1) % n];
    const p2 = expanded[(i + 2) % n];

    // Control points for smooth curve
    const cp1x = p0.x + (p1.x - expanded[(i - 1 + n) % n].x) * 0.25;
    const cp1y = p0.y + (p1.y - expanded[(i - 1 + n) % n].y) * 0.25;
    const cp2x = p1.x - (p2.x - p0.x) * 0.25;
    const cp2y = p1.y - (p2.y - p0.y) * 0.25;

    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
  }

  path += " Z";
  return path;
}

export function HyperEdge({ data }: HyperEdgeProps) {
  const { nodes, color, label, active } = data;
  const path = generateBlobPath(nodes);

  // Calculate centroid for label
  const cx = nodes.reduce((sum, p) => sum + p.x, 0) / nodes.length;
  const cy = nodes.reduce((sum, p) => sum + p.y, 0) / nodes.length;

  return (
    <g class={`hedge ${active ? "hedge--active" : ""}`}>
      {/* Blob shape */}
      <path
        class="hedge__blob"
        d={path}
        fill={color}
        opacity={active ? 0.15 : 0.05}
        stroke={color}
        stroke-width={active ? 1.5 : 0.5}
        stroke-opacity={active ? 0.4 : 0.15}
      />

      {/* Label */}
      {label && (
        <text
          class="hedge__label"
          x={cx}
          y={cy}
          text-anchor="middle"
          dominant-baseline="middle"
          fill={color}
          font-size="8"
          font-family="'Geist Mono', monospace"
          font-weight="500"
          opacity={active ? 0.8 : 0.4}
        >
          {label}
        </text>
      )}

      <style>
        {`
        .hedge__blob {
          transition: all 0.5s ease;
        }

        .hedge--active .hedge__blob {
          animation: hedgePulse 3s ease-in-out infinite;
        }

        @keyframes hedgePulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.22; }
        }

        .hedge__label {
          transition: opacity 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        `}
      </style>
    </g>
  );
}
