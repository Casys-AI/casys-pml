/**
 * GraphTooltip Molecule - Enriched tooltip for graph nodes
 * Story 6.4 AC11: Shows tool name, server, pagerank, degree on hover
 */

import type { JSX } from "preact";
import type { GraphNodeData } from "../atoms/GraphNode.tsx";

interface GraphTooltipProps {
  data: GraphNodeData;
  x: number;
  y: number;
  serverColor: string;
}

export default function GraphTooltip({
  data,
  x,
  y,
  serverColor,
}: GraphTooltipProps): JSX.Element {
  return (
    <div
      class="absolute py-2 px-3 rounded-lg text-xs pointer-events-none z-[1000] whitespace-nowrap"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: "translate(-50%, -100%)",
        background: "rgba(18, 17, 15, 0.95)",
        border: "1px solid rgba(255, 184, 111, 0.2)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div class="font-semibold mb-1" style={{ color: serverColor }}>
        {data.label}
      </div>
      <div style={{ color: "#8a8078" }}>
        <span class="mr-3">Server: {data.server}</span>
        <span class="mr-3">PR: {data.pagerank.toFixed(3)}</span>
        <span>Deg: {data.degree}</span>
      </div>
    </div>
  );
}
