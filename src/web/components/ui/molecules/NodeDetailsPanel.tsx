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

const PANEL_STYLE = {
  background: "rgba(18, 17, 15, 0.9)",
  border: "1px solid rgba(255, 184, 111, 0.1)",
  backdropFilter: "blur(12px)",
};

interface DetailRowProps {
  label: string;
  value: string | number;
}

function DetailRow({ label, value }: DetailRowProps): JSX.Element {
  return (
    <p class="text-sm my-2 leading-relaxed" style={{ color: "#d5c3b5" }}>
      <span style={{ color: "#8a8078" }}>{label}:</span> {value}
    </p>
  );
}

export default function NodeDetailsPanel({
  node,
  onClose,
}: NodeDetailsPanelProps): JSX.Element {
  function handleCloseMouseOver(e: MouseEvent): void {
    const target = e.currentTarget as HTMLElement;
    target.style.background = "rgba(248, 113, 113, 0.1)";
    target.style.color = "#f87171";
  }

  function handleCloseMouseOut(e: MouseEvent): void {
    const target = e.currentTarget as HTMLElement;
    target.style.background = "transparent";
    target.style.color = "#8a8078";
  }

  return (
    <div
      class="absolute bottom-5 left-5 p-5 rounded-xl min-w-[280px] z-10"
      style={PANEL_STYLE}
    >
      <span
        class="absolute top-3 right-3 cursor-pointer w-7 h-7 flex items-center justify-center rounded-md transition-all"
        style={{ color: "#8a8078" }}
        onClick={onClose}
        onMouseOver={handleCloseMouseOver}
        onMouseOut={handleCloseMouseOut}
      >
        {"\u2715"}
      </span>
      <h3 class="text-lg font-semibold mb-3" style={{ color: "#FFB86F" }}>
        {node.label}
      </h3>
      <DetailRow label="Server" value={node.server} />
      <DetailRow label="PageRank" value={node.pagerank.toFixed(4)} />
      <DetailRow label="Degree" value={node.degree} />
    </div>
  );
}
