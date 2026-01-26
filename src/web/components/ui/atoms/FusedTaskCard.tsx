/**
 * FusedTaskCard Atom - Displays a fused task with expandable logical operations
 * Phase 2a: Shows physical task with atomic operations detail using TaskCards
 */

import { useState } from "preact/hooks";
import TaskCard from "./TaskCard.tsx";
import { parseToolId } from "../../../../capabilities/tool-id-utils.ts";

interface LogicalOp {
  toolId: string;
  durationMs?: number;
}

interface FusedTaskCardProps {
  /** Logical operations within this fused task */
  logicalOps: LogicalOp[];
  /** Total duration of the fused task */
  durationMs: number;
  /** Whether the fused task succeeded */
  success: boolean;
  /** Color for the card */
  color: string;
}

export default function FusedTaskCard({
  logicalOps,
  durationMs,
  success,
  color,
}: FusedTaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const bgColor = success
    ? "rgba(34, 197, 94, 0.1)" // green
    : "rgba(239, 68, 68, 0.1)"; // red
  const borderColor = success ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: "4px",
        padding: "8px",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header - Physical Task */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.8125rem",
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: "0.9rem" }}>📦</span>
        <span style={{ color: "var(--text, #E8DFD0)" }}>
          Fused ({logicalOps.length} ops)
        </span>
        <span style={{ color: "var(--text-dim, #8a8078)", fontSize: "0.75rem" }}>
          {durationMs}ms
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.7rem",
            color: "var(--text-dim, #8a8078)",
          }}
        >
          {expanded ? "▼" : "▶"}
        </span>
      </div>

      {/* Expandable - Logical Operations using TaskCards */}
      {expanded && (
        <div
          style={{
            marginTop: "8px",
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
          }}
        >
          {logicalOps.map((op, idx) => {
            // Extract server and tool name from toolId (supports FQDNs and colon format)
            const { namespace: server, action: toolName } = parseToolId(op.toolId);

            return (
              <TaskCard
                key={idx}
                toolName={toolName}
                server={server}
                durationMs={op.durationMs ?? 0}
                success={success}
                color={color}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
