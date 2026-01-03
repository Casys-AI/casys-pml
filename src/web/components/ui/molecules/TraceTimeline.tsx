/**
 * TraceTimeline Molecule - Execution trace timeline grouped by DAG layer
 * Used for: Fan-in/fan-out visualization of parallel tasks (Story 11.4)
 * Phase 2a: Displays fused tasks with expandable logical operations
 * Loop Abstraction: Groups loop iterations with nested visualization
 */

import TaskCard from "../atoms/TaskCard.tsx";
import FusedTaskCard from "../atoms/FusedTaskCard.tsx";
import LoopTaskCard from "../atoms/LoopTaskCard.tsx";

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
  // Loop abstraction metadata (new format: single loop task with bodyTools)
  loopId?: string;
  loopIteration?: number;
  loopType?: "for" | "while" | "forOf" | "forIn" | "doWhile";
  loopCondition?: string;
  bodyTools?: string[]; // New: tools inside the loop (from static DAG)
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

/** Grouped loop with its iterations */
interface LoopGroup {
  loopId: string;
  loopType: string;
  loopCondition?: string;
  iterations: number;
  tasks: TaskResult[]; // All tasks across all iterations
  uniqueTools: string[]; // Unique tools in the loop body (pattern)
  totalDurationMs: number;
  success: boolean;
}

const DEFAULT_COLORS = [
  "#22c55e", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#a855f7", // purple
  "#14b8a6", // teal
  "#ec4899", // pink
];

/**
 * Group tasks by loopId within a layer
 * Handles two formats:
 * - New format: single loop task with tool="loop:forOf" and bodyTools array
 * - Legacy format: multiple tasks with same loopId
 * Returns: { loops: LoopGroup[], nonLoopTasks: TaskResult[] }
 */
function groupTasksByLoop(tasks: TaskResult[]): {
  loops: LoopGroup[];
  nonLoopTasks: TaskResult[];
} {
  const loopMap = new Map<string, TaskResult[]>();
  const loops: LoopGroup[] = [];
  const nonLoopTasks: TaskResult[] = [];

  for (const task of tasks) {
    // New format: task is a loop task itself (tool starts with "loop:")
    if (task.tool.startsWith("loop:")) {
      const loopType = task.tool.replace("loop:", "") as "for" | "while" | "forOf" | "forIn" | "doWhile";
      loops.push({
        loopId: task.loopId || task.taskId,
        loopType: task.loopType || loopType,
        loopCondition: task.loopCondition,
        iterations: 1, // Not tracking iterations in new format (runtime count unknown)
        tasks: [task],
        uniqueTools: task.bodyTools || [], // Use bodyTools from static DAG
        totalDurationMs: task.durationMs,
        success: task.success,
      });
    } else if (task.loopId) {
      // Legacy format: task is inside a loop, group by loopId
      if (!loopMap.has(task.loopId)) {
        loopMap.set(task.loopId, []);
      }
      loopMap.get(task.loopId)!.push(task);
    } else {
      nonLoopTasks.push(task);
    }
  }

  // Process legacy format loop groups
  for (const [loopId, loopTasks] of loopMap) {
    const iterations = Math.max(...loopTasks.map((t) => t.loopIteration ?? 1));
    const uniqueTools = [...new Set(loopTasks.map((t) => t.tool))];
    const totalDurationMs = loopTasks.reduce((sum, t) => sum + t.durationMs, 0);
    const success = loopTasks.every((t) => t.success);
    const firstTask = loopTasks[0];

    loops.push({
      loopId,
      loopType: firstTask.loopType || "for",
      loopCondition: firstTask.loopCondition,
      iterations,
      tasks: loopTasks,
      uniqueTools,
      totalDurationMs,
      success,
    });
  }

  return { loops, nonLoopTasks };
}

export default function TraceTimeline({
  trace,
  getServerColor,
}: TraceTimelineProps) {
  // DEBUG: Log trace data to verify bodyTools
  console.log("[TraceTimeline] trace.taskResults:", JSON.stringify(trace.taskResults, null, 2));

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
        <span
          style={{ color: trace.success ? "var(--success, #22c55e)" : "var(--error, #ef4444)" }}
        >
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

              {/* Tasks in this layer - grouped by loops */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {(() => {
                  const { loops, nonLoopTasks } = groupTasksByLoop(tasks);

                  return (
                    <>
                      {/* Render loop groups */}
                      {loops.map((loop) => {
                        const color = "#a855f7"; // Purple for loops
                        return (
                          <LoopTaskCard
                            key={`loop-${loop.loopId}`}
                            loopType={loop.loopType}
                            condition={loop.loopCondition}
                            iterations={loop.iterations}
                            nestedTasks={loop.uniqueTools.map((tool) => ({
                              toolId: tool,
                              durationMs: loop.totalDurationMs / loop.uniqueTools.length,
                            }))}
                            durationMs={loop.totalDurationMs}
                            success={loop.success}
                            color={color}
                          />
                        );
                      })}

                      {/* Render non-loop tasks */}
                      {nonLoopTasks.map((task, taskIdx) => {
                        const [server = "unknown", ...nameParts] = task.tool.split(":");
                        const toolName = nameParts.join(":") || task.tool;
                        const color = getServerColor?.(server) ||
                          DEFAULT_COLORS[server.charCodeAt(0) % DEFAULT_COLORS.length];

                        // Phase 2a: Render fused tasks with expandable logical operations
                        if (task.isFused && task.logicalOperations) {
                          return (
                            <FusedTaskCard
                              key={`${layerIdx}-fused-${taskIdx}`}
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
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
