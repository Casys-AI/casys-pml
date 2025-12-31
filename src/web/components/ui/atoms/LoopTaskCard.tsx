/**
 * LoopTaskCard Atom - Displays a loop with expandable nested operations
 * Loop Abstraction: Shows loop pattern with iteration count badge
 */

import { useState } from "preact/hooks";

interface NestedTask {
  toolId: string;
  durationMs?: number;
}

interface LoopTaskCardProps {
  /** Loop type (for, while, forOf, forIn, doWhile) */
  loopType: string;
  /** Condition text (e.g., "item of items") */
  condition?: string;
  /** Number of iterations executed */
  iterations: number;
  /** Nested operations within the loop body */
  nestedTasks: NestedTask[];
  /** Total duration of all iterations */
  durationMs: number;
  /** Whether all iterations succeeded */
  success: boolean;
  /** Color for the card */
  color: string;
}

/**
 * Get display label for loop type
 */
function getLoopLabel(loopType: string): string {
  switch (loopType) {
    case "forOf":
      return "for...of";
    case "forIn":
      return "for...in";
    case "doWhile":
      return "do...while";
    default:
      return loopType;
  }
}

export default function LoopTaskCard({
  loopType,
  condition,
  iterations,
  nestedTasks,
  durationMs,
  success,
  color,
}: LoopTaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const bgColor = success
    ? "rgba(168, 85, 247, 0.1)" // purple for loops
    : "rgba(239, 68, 68, 0.1)"; // red for failed
  const borderColor = success ? "rgba(168, 85, 247, 0.3)" : "rgba(239, 68, 68, 0.3)";

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
      {/* Header - Loop with iteration badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.8125rem",
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: "0.9rem" }}>🔄</span>
        {/* Iteration count badge */}
        <span
          style={{
            background: "rgba(168, 85, 247, 0.3)",
            color: "#a855f7",
            padding: "2px 6px",
            borderRadius: "10px",
            fontSize: "0.7rem",
            fontWeight: 600,
          }}
        >
          {iterations}x
        </span>
        <span style={{ color: "var(--text, #E8DFD0)" }}>
          {getLoopLabel(loopType)}
        </span>
        {condition && (
          <span
            style={{
              color: "var(--text-dim, #8a8078)",
              fontSize: "0.75rem",
              fontFamily: "monospace",
              maxWidth: "150px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={condition}
          >
            ({condition})
          </span>
        )}
        <span style={{ color: "var(--text-dim, #8a8078)", fontSize: "0.75rem", marginLeft: "auto" }}>
          {durationMs}ms
        </span>
        <span
          style={{
            fontSize: "0.7rem",
            color: "var(--text-dim, #8a8078)",
          }}
        >
          {expanded ? "▼" : "▶"}
        </span>
      </div>

      {/* Expandable - Nested operations (one iteration pattern) */}
      {expanded && nestedTasks.length > 0 && (
        <div
          style={{
            marginTop: "8px",
            paddingLeft: "20px",
            borderLeft: "2px dashed rgba(168, 85, 247, 0.3)",
          }}
        >
          <div
            style={{
              fontSize: "0.65rem",
              color: "var(--text-dim, #8a8078)",
              marginBottom: "4px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Pattern per iteration:
          </div>
          {nestedTasks.map((task, idx) => {
            const [server = "", ...nameParts] = task.toolId.split(":");
            const toolName = nameParts.join(":") || task.toolId;
            const isLast = idx === nestedTasks.length - 1;

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
                {server && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      color: "var(--text-dim, #8a8078)",
                      padding: "1px 4px",
                      background: "rgba(255, 255, 255, 0.05)",
                      borderRadius: "2px",
                    }}
                  >
                    {server}
                  </span>
                )}
                <span style={{ fontFamily: "monospace" }}>{toolName}</span>
                {task.durationMs !== undefined && (
                  <span style={{ color: "var(--text-dim, #8a8078)" }}>
                    (~{Math.round(task.durationMs / iterations)}ms)
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
