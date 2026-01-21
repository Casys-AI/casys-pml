/**
 * GraphEdge3D - 3D edge atom for hyper-graph
 *
 * A connection between nodes with depth-based styling.
 * Supports regular edges and hyper-edges (connecting through hubs).
 *
 * @module web/components/landing/atoms/GraphEdge3D
 */

export interface GraphEdge3DProps {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  color?: string;
  isActive?: boolean;
  isHyperEdge?: boolean;
}

export function GraphEdge3D({
  x1,
  y1,
  z1,
  x2,
  y2,
  z2,
  color = "#2a2a2a",
  isActive = false,
  isHyperEdge = false,
}: GraphEdge3DProps) {
  // Average depth for edge styling
  const avgZ = (z1 + z2) / 2;
  const depthOpacity = 1 - avgZ * 0.2;
  const strokeWidth = isActive ? 1.5 : 1;

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={isActive ? color : "#2a2a2a"}
      stroke-width={strokeWidth * (1 - avgZ * 0.1)}
      stroke-dasharray={isHyperEdge ? "4,4" : "none"}
      opacity={(isActive ? 0.8 : 0.4) * depthOpacity}
      class={`ge3d ${isActive ? "ge3d--active" : ""} ${isHyperEdge ? "ge3d--hyper" : ""}`}
    />
  );
}
