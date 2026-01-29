/**
 * FusedTaskCard Atom - Displays a fused task with expandable logical operations
 * Phase 2a: Shows physical task with atomic operations detail using TaskCards
 */

import type { JSX } from "preact";
import { useState } from "preact/hooks";
import TaskCard from "./TaskCard.tsx";
import { parseToolId } from "../../../../capabilities/tool-id-utils.ts";

export interface LogicalOp {
  toolId: string;
  durationMs?: number;
}

export interface FusedTaskCardProps {
  /** Logical operations within this fused task */
  logicalOps: LogicalOp[];
  /** Total duration of the fused task */
  durationMs: number;
  /** Whether the fused task succeeded */
  success: boolean;
  /** Color for the card */
  color: string;
}

function getStatusColors(success: boolean): { background: string; border: string } {
  if (success) {
    return {
      background: "rgba(34, 197, 94, 0.1)",
      border: "rgba(34, 197, 94, 0.3)",
    };
  }
  return {
    background: "rgba(239, 68, 68, 0.1)",
    border: "rgba(239, 68, 68, 0.3)",
  };
}

export default function FusedTaskCard({
  logicalOps,
  durationMs,
  success,
  color,
}: FusedTaskCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const statusColors = getStatusColors(success);

  function handleClick(): void {
    setExpanded((prev) => !prev);
  }

  return (
    <div
      style={{
        background: statusColors.background,
        border: `1px solid ${statusColors.border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: "4px",
        padding: "8px",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
      onClick={handleClick}
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
        <span style={{ fontSize: "0.9rem" }}>
          {"\uD83D\uDCE6"}
        </span>
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
          {expanded ? "\u25BC" : "\u25B6"}
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
