/**
 * TraceTimeline Molecule - Execution trace timeline grouped by DAG layer
 * Used for: Fan-in/fan-out visualization of parallel tasks (Story 11.4)
 * Phase 2a: Displays fused tasks with expandable logical operations
 * Loop Abstraction: Groups loop iterations with nested visualization
 */

import TaskCard from "../atoms/TaskCard.tsx";
import FusedTaskCard from "../atoms/FusedTaskCard.tsx";
import LoopTaskCard from "../atoms/LoopTaskCard.tsx";
import CapabilityTaskCard from "../atoms/CapabilityTaskCard.tsx";
import { parseToolId } from "../../../../capabilities/tool-id-utils.ts";

interface LogicalOperation {
  toolId: string;
  durationMs?: number;
}

interface TaskResult {
  taskId: string;
  tool: string;
  resolvedTool?: string;
  success: boolean;
  durationMs: number;
  layerIndex?: number;
  isFused?: boolean;
  logicalOperations?: LogicalOperation[];
  loopId?: string;
  loopIteration?: number;
  loopType?: "for" | "while" | "forOf" | "forIn" | "doWhile";
  loopCondition?: string;
  bodyTools?: string[];
  isCapabilityCall?: boolean;
  nestedTools?: string[];
}

interface ExecutionTrace {
  id: string;
  success: boolean;
  durationMs: number;
  errorMessage?: string | null;
  priority: number;
  taskResults: TaskResult[];
  executedPath?: string[];
}

interface TraceTimelineProps {
  trace: ExecutionTrace;
  getServerColor?: (server: string) => string;
}

interface LoopGroup {
  loopId: string;
  loopType: string;
  loopCondition?: string;
  iterations: number;
  tasks: TaskResult[];
  uniqueTools: string[];
  totalDurationMs: number;
  success: boolean;
}

const DEFAULT_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#a855f7",
  "#14b8a6",
  "#ec4899",
];

function groupTasksByLoop(tasks: TaskResult[]): {
  loops: LoopGroup[];
  nonLoopTasks: TaskResult[];
} {
  const loopMap = new Map<string, TaskResult[]>();
  const loops: LoopGroup[] = [];
  const nonLoopTasks: TaskResult[] = [];

  for (const task of tasks) {
    if (task.tool.startsWith("loop:")) {
      const loopType = task.tool.replace("loop:", "") as "for" | "while" | "forOf" | "forIn" | "doWhile";
      loops.push({
        loopId: task.loopId || task.taskId,
        loopType: task.loopType || loopType,
        loopCondition: task.loopCondition,
        iterations: 1,
        tasks: [task],
        uniqueTools: task.bodyTools || [],
        totalDurationMs: task.durationMs,
        success: task.success,
      });
    } else if (task.loopId) {
      if (!loopMap.has(task.loopId)) {
        loopMap.set(task.loopId, []);
      }
      loopMap.get(task.loopId)!.push(task);
    } else {
      nonLoopTasks.push(task);
    }
  }

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
    <div class="bg-stone-950 rounded-lg border border-amber-500/10 p-3">
      <div class="flex gap-4 mb-3 text-sm flex-wrap">
        <span class={trace.success ? "text-green-500" : "text-red-500"}>
          {trace.success ? "✅ Success" : "❌ Failed"}
        </span>
        <span class="text-stone-300">
          {trace.durationMs}ms total
        </span>
        <span class="text-stone-500">
          {trace.taskResults.length} tasks
        </span>
        <span
          class="px-1.5 py-0.5 rounded text-pml-accent text-[0.7rem]"
          style={{ background: `rgba(255, 184, 111, ${trace.priority * 0.3})` }}
          title="TD Error priority for learning"
        >
          P: {(trace.priority * 100).toFixed(0)}%
        </span>
      </div>

      {!trace.success && trace.errorMessage && (
        <div class="p-2 mb-3 rounded bg-red-500/10 text-red-500 text-sm">
          {trace.errorMessage}
        </div>
      )}

      <div class="flex flex-col gap-2">
        {sortedLayers.map(([layerIdx, tasks]) => {
          return (
            <div key={layerIdx}>
              <div class="text-[0.7rem] text-stone-500 mb-1 uppercase tracking-wider">
                Layer {layerIdx} {tasks.length > 1 ? `(${tasks.length} parallel)` : ""}
              </div>

              <div class="flex flex-wrap gap-2">
                {(() => {
                  const { loops, nonLoopTasks } = groupTasksByLoop(tasks);

                  return (
                    <>
                      {loops.map((loop) => {
                        const color = "#a855f7";
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

                      {nonLoopTasks.map((task, taskIdx) => {
                        if (task.isCapabilityCall) {
                          const nestedTasks = (task.nestedTools || []).map((toolId) => ({
                            toolId,
                            durationMs: task.durationMs / (task.nestedTools?.length || 1),
                          }));
                          const { namespace, action } = parseToolId(task.tool);
                          const displayName = `${namespace}:${action}`;
                          return (
                            <CapabilityTaskCard
                              key={`${layerIdx}-cap-${taskIdx}`}
                              capabilityId={task.tool}
                              capabilityName={displayName}
                              nestedTasks={nestedTasks}
                              durationMs={task.durationMs}
                              success={task.success}
                            />
                          );
                        }

                        const { namespace: server, action: toolName } = parseToolId(task.tool);
                        const color = getServerColor?.(server) ||
                          DEFAULT_COLORS[server.charCodeAt(0) % DEFAULT_COLORS.length];

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
