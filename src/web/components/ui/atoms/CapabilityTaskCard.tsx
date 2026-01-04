/**
 * CapabilityTaskCard Atom - Displays a nested capability call with expandable DAG
 * Story 10.1: Meta-capability visualization in traces
 */

import { useState } from "preact/hooks";

interface NestedTask {
  toolId: string;
  durationMs?: number;
  success?: boolean;
}

interface CapabilityTaskCardProps {
  /** Capability UUID (e.g., "$cap:9f597aff-...") */
  capabilityId: string;
  /** Resolved capability name (e.g., "fake:person") */
  capabilityName: string;
  /** Nested operations within the capability */
  nestedTasks: NestedTask[];
  /** Total duration */
  durationMs: number;
  /** Whether execution succeeded */
  success: boolean;
  /** Color for the card */
  color?: string;
  /** Hierarchy level of the capability (0=leaf, 1+=meta) */
  hierarchyLevel?: number;
}

export default function CapabilityTaskCard({
  capabilityId,
  capabilityName,
  nestedTasks,
  durationMs,
  success,
  color = "#FFB86F",
  hierarchyLevel = 0,
}: CapabilityTaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const bgColor = success
    ? "rgba(255, 184, 111, 0.1)" // amber for capabilities
    : "rgba(239, 68, 68, 0.1)"; // red for failed
  const borderColor = success ? "rgba(255, 184, 111, 0.3)" : "rgba(239, 68, 68, 0.3)";

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: "4px",
        padding: "8px",
        cursor: nestedTasks.length > 0 ? "pointer" : "default",
        transition: "all 0.2s",
      }}
      onClick={() => nestedTasks.length > 0 && setExpanded(!expanded)}
    >
      {/* Header - Capability with hierarchy badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.8125rem",
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: "0.9rem" }} title={capabilityId}>📦</span>
        {/* Hierarchy level badge */}
        {hierarchyLevel > 0 && (
          <span
            style={{
              background: "rgba(255, 184, 111, 0.3)",
              color: "#FFB86F",
              padding: "2px 6px",
              borderRadius: "10px",
              fontSize: "0.7rem",
              fontWeight: 600,
            }}
          >
            L{hierarchyLevel}
          </span>
        )}
        <span
          style={{
            color: "var(--accent, #FFB86F)",
            fontWeight: 600,
          }}
        >
          {capabilityName}
        </span>
        {nestedTasks.length > 0 && (
          <span
            style={{
              color: "var(--text-dim, #8a8078)",
              fontSize: "0.7rem",
            }}
          >
            ({nestedTasks.length} tasks)
          </span>
        )}
        <span
          style={{
            color: "var(--text-dim, #8a8078)",
            fontSize: "0.75rem",
            marginLeft: "auto",
          }}
        >
          {durationMs}ms
        </span>
        {nestedTasks.length > 0 && (
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--text-dim, #8a8078)",
            }}
          >
            {expanded ? "▼" : "▶"}
          </span>
        )}
      </div>

      {/* Expandable - Nested DAG tasks */}
      {expanded && nestedTasks.length > 0 && (
        <div
          style={{
            marginTop: "8px",
            paddingLeft: "20px",
            borderLeft: "2px dashed rgba(255, 184, 111, 0.3)",
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
            Nested DAG:
          </div>
          {nestedTasks.map((task, idx) => {
            const [server = "", ...nameParts] = task.toolId.split(":");
            const toolName = nameParts.join(":") || task.toolId;
            const displayName = toolName.length > 15 ? toolName.slice(0, 13) + ".." : toolName;
            const taskSuccess = task.success !== false;
            // Generate color from server name (same logic as TaskCard)
            const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#14b8a6", "#ec4899"];
            const taskColor = colors[server.charCodeAt(0) % colors.length];

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: `${taskColor}15`,
                  border: `1px solid ${taskColor}40`,
                  marginBottom: idx < nestedTasks.length - 1 ? "4px" : "0",
                }}
              >
                <span style={{ color: taskSuccess ? "var(--success, #22c55e)" : "var(--error, #ef4444)" }}>
                  {taskSuccess ? "✓" : "✗"}
                </span>
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: taskColor,
                  }}
                />
                <span
                  style={{
                    color: taskColor,
                    fontWeight: 500,
                    fontSize: "0.8125rem",
                  }}
                >
                  {displayName}
                </span>
                {task.durationMs !== undefined && (
                  <span
                    style={{
                      color: "var(--text-dim, #8a8078)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {Math.round(task.durationMs)}ms
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
