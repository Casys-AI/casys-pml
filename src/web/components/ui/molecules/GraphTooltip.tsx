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
      class="absolute py-2.5 px-3.5 rounded-lg text-xs pointer-events-none z-[1000] min-w-[160px] bg-stone-900/95 border border-pml-accent/25 backdrop-blur-md shadow-lg shadow-black/40"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div class="font-bold text-sm mb-2 text-white">
        {data.label}
      </div>

      <div class="flex items-center gap-2 mb-1.5">
        <div
          class="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: serverColor }}
        />
        <span class="text-stone-300">{data.server}</span>
      </div>

      <div class="flex gap-4 pt-1.5 mt-1.5 border-t border-white/10">
        <div>
          <span class="text-stone-500">PR</span>
          <span class="text-pml-accent">{data.pagerank.toFixed(3)}</span>
        </div>
        <div>
          <span class="text-stone-500">Deg</span>
          <span class="text-stone-300">{data.degree}</span>
        </div>
      </div>
    </div>
  );
}
