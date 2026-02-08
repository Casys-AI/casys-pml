/**
 * NodeDetailsPanel Molecule - Details panel for selected graph node
 * Story 6.4 AC3: Shows label, server, pagerank, degree when node is selected
 */

import type { JSX } from "preact";
import type { GraphNodeData } from "../atoms/GraphNode.tsx";

export interface NodeDetailsPanelProps {
  node: GraphNodeData;
  onClose: () => void;
}

interface DetailRowProps {
  label: string;
  value: string | number;
}

function DetailRow({ label, value }: DetailRowProps): JSX.Element {
  return (
    <p class="text-sm my-2 leading-relaxed text-stone-300">
      <span class="text-stone-500">{label}:</span> {value}
    </p>
  );
}

export default function NodeDetailsPanel({
  node,
  onClose,
}: NodeDetailsPanelProps): JSX.Element {
  return (
    <div class="absolute bottom-5 left-5 p-5 rounded-xl min-w-[280px] z-10 bg-stone-900/90 border border-pml-accent/10 backdrop-blur-md">
      <span
        class="absolute top-3 right-3 cursor-pointer w-7 h-7 flex items-center justify-center rounded-md transition-all text-stone-500 hover:bg-red-400/10 hover:text-red-400"
        onClick={onClose}
      >
        {"\u2715"}
      </span>
      <h3 class="text-lg font-semibold mb-3 text-pml-accent">
        {node.label}
      </h3>
      <DetailRow label="Server" value={node.server} />
      <DetailRow label="PageRank" value={node.pagerank.toFixed(4)} />
      <DetailRow label="Degree" value={node.degree} />
    </div>
  );
}
