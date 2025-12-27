/**
 * FusedTaskCard Atom - Displays a fused task with expandable logical operations
 * Phase 2a: Shows physical task with atomic operations detail
 */

import { useState } from "preact/hooks";

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

      {/* Expandable - Logical Operations */}
      {expanded && (
        <div
          style={{
            marginTop: "8px",
            paddingLeft: "20px",
            borderLeft: "2px solid rgba(255, 184, 111, 0.2)",
          }}
        >
          {logicalOps.map((op, idx) => {
            const toolName = op.toolId.replace("code:", "");
            const isLast = idx === logicalOps.length - 1;

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.75rem",
                  color: "var(--text-muted, #d5c3b5)",
                  marginBottom: isLast ? "0" : "4px",
                }}
              >
                <span style={{ color: "var(--text-dim, #8a8078)" }}>
                  {isLast ? "└─" : "├─"}
                </span>
                <span style={{ fontFamily: "monospace" }}>{toolName}</span>
                {op.durationMs !== undefined && (
                  <span style={{ color: "var(--text-dim, #8a8078)" }}>
                    ({Math.round(op.durationMs)}ms)
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
