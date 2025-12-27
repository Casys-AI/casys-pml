/**
 * TraceTimeline Molecule - Execution trace timeline grouped by DAG layer
 * Used for: Fan-in/fan-out visualization of parallel tasks (Story 11.4)
 * Phase 2a: Displays fused tasks with expandable logical operations
 */

import TaskCard from "../atoms/TaskCard.tsx";
import FusedTaskCard from "../atoms/FusedTaskCard.tsx";

interface LogicalOperation {
  toolId: string;
  durationMs?: number;
}

interface TaskResult {
  taskId: string;
  tool: string;
  success: boolean;
  durationMs: number;
  layerIndex?: number;
  // Phase 2a: Fusion metadata
  isFused?: boolean;
  logicalOperations?: LogicalOperation[];
}

interface ExecutionTrace {
  id: string;
  success: boolean;
  durationMs: number;
  errorMessage?: string | null;
  priority: number;
  taskResults: TaskResult[];
}

interface TraceTimelineProps {
  trace: ExecutionTrace;
  getServerColor?: (server: string) => string;
}

const DEFAULT_COLORS = [
  "#22c55e", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#a855f7", // purple
  "#14b8a6", // teal
  "#ec4899", // pink
];

export default function TraceTimeline({
  trace,
  getServerColor,
}: TraceTimelineProps) {
  // Group tasks by layerIndex for fan-in/fan-out visualization
  const tasksByLayer = new Map<number, TaskResult[]>();
  for (const task of trace.taskResults) {
    const layer = task.layerIndex ?? 0;
    if (!tasksByLayer.has(layer)) {
      tasksByLayer.set(layer, []);
    }
    tasksByLayer.get(layer)!.push(task);
  }
  const sortedLayers = Array.from(tasksByLayer.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div
      style={{
        background: "var(--bg, #0a0908)",
        borderRadius: "8px",
        border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
        padding: "12px",
      }}
    >
      {/* Trace Summary */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "12px",
          fontSize: "0.8125rem",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: trace.success ? "var(--success, #22c55e)" : "var(--error, #ef4444)" }}>
          {trace.success ? "✅ Success" : "❌ Failed"}
        </span>
        <span style={{ color: "var(--text-muted, #d5c3b5)" }}>
          {trace.durationMs}ms total
        </span>
        <span style={{ color: "var(--text-dim, #8a8078)" }}>
          {trace.taskResults.length} tasks
        </span>
        <span
          style={{
            padding: "2px 6px",
            borderRadius: "4px",
            background: `rgba(255, 184, 111, ${trace.priority * 0.3})`,
            color: "var(--accent, #FFB86F)",
            fontSize: "0.7rem",
          }}
          title="TD Error priority for learning"
        >
          P: {(trace.priority * 100).toFixed(0)}%
        </span>
      </div>

      {/* Error Message if failed */}
      {!trace.success && trace.errorMessage && (
        <div
          style={{
            padding: "8px",
            marginBottom: "12px",
            borderRadius: "4px",
            background: "rgba(239, 68, 68, 0.1)",
            color: "var(--error, #ef4444)",
            fontSize: "0.8125rem",
          }}
        >
          {trace.errorMessage}
        </div>
      )}

      {/* Task Timeline by Layer (Fan-in/Fan-out) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {sortedLayers.map(([layerIdx, tasks]) => {
          return (
            <div key={layerIdx}>
              {/* Layer header */}
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-dim, #8a8078)",
                  marginBottom: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Layer {layerIdx} {tasks.length > 1 ? `(${tasks.length} parallel)` : ""}
              </div>

              {/* Tasks in this layer */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {tasks.map((task, taskIdx) => {
                  const [server = "unknown", ...nameParts] = task.tool.split(":");
                  const toolName = nameParts.join(":") || task.tool;
                  const color = getServerColor?.(server) ||
                    DEFAULT_COLORS[server.charCodeAt(0) % DEFAULT_COLORS.length];

                  // Phase 2a: Render fused tasks with expandable logical operations
                  if (task.isFused && task.logicalOperations) {
                    return (
                      <FusedTaskCard
                        key={`${layerIdx}-${taskIdx}`}
                        logicalOps={task.logicalOperations}
                        durationMs={task.durationMs}
                        success={task.success}
                        color={color}
                      />
                    );
                  }

                  // Regular task card
                  return (
                    <TaskCard
                      key={`${layerIdx}-${taskIdx}`}
                      toolName={toolName}
                      server={server}
                      durationMs={task.durationMs}
                      success={task.success}
                      color={color}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
