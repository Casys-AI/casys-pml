/**
 * HyperEdgeHub - Hub connecting multiple nodes (hyper-edge)
 *
 * A hyper-edge connects 3+ nodes through a central hub point.
 * Rendered as dashed lines from hub to each connected node.
 *
 * @module web/components/landing/molecules/HyperEdgeHub
 */

import { GraphEdge3D } from "../atoms/GraphEdge3D.tsx";

export interface HyperEdgeHubProps {
  hub: { x: number; y: number; z: number };
  nodes: Array<{ x: number; y: number; z: number }>;
  color: string;
  label?: string;
}

export function HyperEdgeHub({ hub, nodes, color, label }: HyperEdgeHubProps) {
  const depthOpacity = 1 - hub.z * 0.2;

  return (
    <g>
      {nodes.map((node, i) => (
        <GraphEdge3D
          key={i}
          x1={hub.x}
          y1={hub.y}
          z1={hub.z}
          x2={node.x}
          y2={node.y}
          z2={node.z}
          color={color}
          isHyperEdge
        />
      ))}

      <circle
        cx={hub.x}
        cy={hub.y}
        r={3}
        fill={color}
        opacity={0.6 * depthOpacity}
      />

      {label && (
        <text
          x={hub.x}
          y={hub.y - 8}
          fill={color}
          class="text-[7px] font-mono"
          text-anchor="middle"
          opacity={0.7 * depthOpacity}
        >
          {label}
        </text>
      )}
    </g>
  );
}
