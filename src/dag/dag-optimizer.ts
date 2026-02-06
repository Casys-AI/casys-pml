/**
 * DAG Optimizer - Two-Level DAG Architecture (Phase 2)
 *
 * Optimizes logical DAGs by fusing sequential code operations into physical tasks.
 * This eliminates variable binding issues while maintaining SHGAT learning granularity.
 *
 * Architecture:
 * - Logical DAG: All operations as separate tasks (SHGAT sees everything)
 * - Physical DAG: Fused tasks for efficient execution (fewer layers)
 * - Trace mapping: Physical results → Logical traces for SHGAT
 *
 * See: docs/tech-specs/modular-dag-execution/two-level-dag-architecture.md
 *
 * @module dag/dag-optimizer
 */

import type { DAGStructure, Task } from "../graphrag/types.ts";
import { getLogger } from "../telemetry/logger.ts";

const log = getLogger("dag-optimizer");

/**
 * Optimized DAG structure with logical-to-physical mapping
 */
export interface OptimizedDAGStructure {
  /** Physical tasks for execution (may be fused) */
  tasks: Task[];

  /** Mapping from logical task IDs to physical task IDs */
  logicalToPhysical: Map<string, string>;

  /** Mapping from physical task IDs to logical task IDs */
  physicalToLogical: Map<string, string[]>;

  /** Original logical DAG for trace generation */
  logicalDAG: DAGStructure;
}

/**
 * Configuration for DAG optimization
 */
export interface OptimizationConfig {
  /** Enable fusion optimization (default: true) */
  enabled?: boolean;

  /** Maximum number of tasks to fuse together (default: 10) */
  maxFusionSize?: number;

  /** Strategy: "sequential" (Phase 2a) or "full" (Phase 2b+) */
  strategy?: "sequential" | "full";
}

/**
 * Optimize a logical DAG by fusing sequential code operations
 *
 * Phase 2a: Only fuses simple sequential chains (A→B→C)
 * Phase 2b+: Handles fork-join, partial fusion, etc.
 *
 * @param logicalDAG DAG with all operations as separate tasks
 * @param config Optimization configuration
 * @returns Optimized DAG with fused physical tasks
 */
export function optimizeDAG(
  logicalDAG: DAGStructure,
  config: OptimizationConfig = {},
): OptimizedDAGStructure {
  const {
    enabled = true,
    maxFusionSize = 10,
    strategy = "sequential",
  } = config;

  if (!enabled) {
    log.debug("Optimization disabled, returning logical DAG as-is");
    return {
      tasks: logicalDAG.tasks,
      logicalToPhysical: new Map(logicalDAG.tasks.map((t) => [t.id, t.id])),
      physicalToLogical: new Map(logicalDAG.tasks.map((t) => [t.id, [t.id]])),
      logicalDAG,
    };
  }

  log.debug("Optimizing DAG", {
    logicalTaskCount: logicalDAG.tasks.length,
    strategy,
  });

  // Phase 2a: Sequential fusion only
  if (strategy === "sequential") {
    return optimizeSequential(logicalDAG, maxFusionSize);
  }

  // Phase 2b+: Full optimization (not implemented yet)
  throw new Error(`Optimization strategy "${strategy}" not implemented yet`);
}

/**
 * Optimize DAG using sequential fusion strategy
 *
 * Finds chains of sequential code tasks and fuses them:
 * - MCP tasks stay separate (side effects)
 * - Code tasks in sequence get fused
 * - Maintains dependencies correctly
 */
function optimizeSequential(
  logicalDAG: DAGStructure,
  maxFusionSize: number,
): OptimizedDAGStructure {
  const physicalTasks: Task[] = [];
  const logicalToPhysical = new Map<string, string>();
  const physicalToLogical = new Map<string, string[]>();
  const processed = new Set<string>();

  // CRITICAL-7 Fix: First pass - identify all tasks that will be skipped
  // This is needed to clean up dependsOn references before adding tasks
  const skippedTaskIds = new Set<string>();
  for (const task of logicalDAG.tasks) {
    if (task.metadata?.executable === false) {
      skippedTaskIds.add(task.id);
      log.debug("Marking non-executable task for skip", {
        taskId: task.id,
        tool: task.tool,
        parentOperation: task.metadata?.parentOperation,
      });
    }
  }

  // CRITICAL-7 Fix: Helper to clean dependsOn by removing skipped tasks
  const cleanDependsOn = (deps: string[]): string[] => {
    return deps.filter((dep) => !skippedTaskIds.has(dep));
  };

  for (const task of logicalDAG.tasks) {
    if (processed.has(task.id)) continue;

    // Option B: Skip non-executable tasks from physical DAG
    // They stay in logicalDAG for trace-generator to include in executedPath for SHGAT
    if (task.metadata?.executable === false) {
      processed.add(task.id);
      // No physical task, no mapping - trace-generator handles these separately
      continue;
    }

    // If it's an MCP task, keep as-is (with cleaned deps)
    if (task.type === "mcp_tool") {
      const cleanedTask = { ...task, dependsOn: cleanDependsOn(task.dependsOn) };
      physicalTasks.push(cleanedTask);
      logicalToPhysical.set(task.id, task.id);
      physicalToLogical.set(task.id, [task.id]);
      processed.add(task.id);
      continue;
    }

    // If it's a code task, try to find a fusible chain
    if (task.type === "code_execution" && task.tool?.startsWith("code:")) {
      const chain = findSequentialChain(task, logicalDAG, processed, maxFusionSize);

      log.debug("Checking fusion for chain", {
        startTaskId: task.id,
        chainLength: chain.length,
        chainTools: chain.map((t) => t.tool),
      });

      if (chain.length > 1 && canFuseTasks(chain)) {
        // Fuse the chain
        const fusedTask = fuseTasks(chain);
        // CRITICAL-7 Fix: Clean dependencies on fused task too
        fusedTask.dependsOn = cleanDependsOn(fusedTask.dependsOn);
        physicalTasks.push(fusedTask);

        // Update mappings
        for (const chainTask of chain) {
          logicalToPhysical.set(chainTask.id, fusedTask.id);
          processed.add(chainTask.id);
        }
        physicalToLogical.set(fusedTask.id, chain.map((t) => t.id));

        log.debug("Fused task chain", {
          fusedTaskId: fusedTask.id,
          logicalTasks: chain.map((t) => t.id),
          operations: chain.map((t) => t.tool),
        });
      } else {
        // Keep as-is (single task or can't fuse, with cleaned deps)
        const cleanedTask = { ...task, dependsOn: cleanDependsOn(task.dependsOn) };
        physicalTasks.push(cleanedTask);

        // Collect all chain operations (includes non-executable predecessors + nested ops)
        const chainOps = collectChainOperations(task, logicalDAG, skippedTaskIds);

        // Map all chain tasks to this physical task
        for (const chainTaskId of chainOps) {
          logicalToPhysical.set(chainTaskId, task.id);
        }
        physicalToLogical.set(task.id, chainOps);
        processed.add(task.id);

        if (chainOps.length > 1) {
          log.debug("Chain operations collected for physical task", {
            physicalTaskId: task.id,
            chainOps,
            chainTools: chainOps.map((id) =>
              logicalDAG.tasks.find((t) => t.id === id)?.tool
            ),
          });
        }
      }
    } else {
      // Other task types (capability, etc.) - keep as-is (with cleaned deps)
      const cleanedTask = { ...task, dependsOn: cleanDependsOn(task.dependsOn) };
      physicalTasks.push(cleanedTask);
      logicalToPhysical.set(task.id, task.id);
      physicalToLogical.set(task.id, [task.id]);
      processed.add(task.id);
    }
  }

  log.info("DAG optimization complete", {
    logicalTasks: logicalDAG.tasks.length,
    physicalTasks: physicalTasks.length,
    fusionRate: Math.round((1 - physicalTasks.length / logicalDAG.tasks.length) * 100),
  });

  return {
    tasks: physicalTasks,
    logicalToPhysical,
    physicalToLogical,
    logicalDAG,
  };
}

/**
 * Find a sequential chain of code tasks starting from a given task
 *
 * A chain is sequential if each task depends only on the previous task.
 */
function findSequentialChain(
  startTask: Task,
  dag: DAGStructure,
  processed: Set<string>,
  maxSize: number,
): Task[] {
  const chain: Task[] = [startTask];
  let currentTask = startTask;

  while (chain.length < maxSize) {
    // Find tasks that depend ONLY on the current task
    const nextCandidates = dag.tasks.filter((t) =>
      !processed.has(t.id) &&
      t.id !== currentTask.id &&
      t.type === "code_execution" &&
      t.tool?.startsWith("code:") &&
      t.dependsOn.length === 1 &&
      t.dependsOn[0] === currentTask.id
    );

    if (nextCandidates.length !== 1) {
      // Either no next task, or multiple tasks depend on current (fork)
      break;
    }

    const nextTask = nextCandidates[0];

    // Check if any other task depends on the current task
    const otherDependents = dag.tasks.filter((t) =>
      t.id !== nextTask.id &&
      t.dependsOn.includes(currentTask.id)
    );

    if (otherDependents.length > 0) {
      // Current task has multiple dependents (fork point)
      break;
    }

    chain.push(nextTask);
    currentTask = nextTask;
  }

  return chain;
}

/**
 * Collect all chain operations for an executable task
 *
 * Includes:
 * 1. All non-executable tasks reachable via dependsOn (transitive)
 * 2. Nested operations whose parentOperation matches a task in the chain
 *
 * This allows physicalToLogical to map a single physical task to all
 * logical operations it represents (for chain operations like split().map().join())
 */
function collectChainOperations(
  executableTask: Task,
  logicalDAG: DAGStructure,
  skippedTaskIds: Set<string>,
): string[] {
  const chainTaskIds = new Set<string>();

  // 1. Follow dependsOn backwards to collect direct chain
  const queue = [executableTask.id];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    if (visited.has(taskId)) continue;
    visited.add(taskId);

    const task = logicalDAG.tasks.find((t) => t.id === taskId);
    if (!task) continue;

    // Add to chain if it's either the executable task or a skipped task
    if (taskId === executableTask.id || skippedTaskIds.has(taskId)) {
      chainTaskIds.add(taskId);
    }

    // Continue following dependencies
    for (const depId of task.dependsOn) {
      queue.push(depId);
    }
  }

  // 2. Find nested operations (those with parentOperation pointing to a task in the chain)
  // e.g., toUpperCase nested inside map callback
  for (const task of logicalDAG.tasks) {
    if (skippedTaskIds.has(task.id) && !chainTaskIds.has(task.id)) {
      const parentOp = task.metadata?.parentOperation as string | undefined;
      if (parentOp) {
        // Check if any chain task has this tool
        for (const chainTaskId of chainTaskIds) {
          const chainTask = logicalDAG.tasks.find((t) => t.id === chainTaskId);
          if (chainTask?.tool === parentOp) {
            chainTaskIds.add(task.id);
            break;
          }
        }
      }
    }
  }

  // 3. Return in DAG order (by position in logicalDAG.tasks)
  return logicalDAG.tasks
    .filter((t) => chainTaskIds.has(t.id))
    .map((t) => t.id);
}

/**
 * Check if a group of tasks can be fused together
 *
 * Fusion rules:
 * 1. All tasks must be code_execution
 * 2. All tasks must be executable standalone (Option B)
 * 3. All tasks must be pure operations (no side effects)
 * 4. All tasks must have same permission set
 * 5. No MCP calls in the code
 */
export function canFuseTasks(tasks: Task[]): boolean {
  if (tasks.length === 0) return false;

  // Rule 1: All must be code_execution
  if (!tasks.every((t) => t.type === "code_execution")) {
    return false;
  }

  // Rule 2 (Option B): All must be executable standalone
  // Tasks nested inside callbacks (executable=false) cannot be fused or executed
  const nonExecutable = tasks.filter((t) => t.metadata?.executable === false);
  if (nonExecutable.length > 0) {
    log.debug("Cannot fuse: contains non-executable nested operations", {
      taskIds: tasks.map((t) => t.id),
      nonExecutable: nonExecutable.map((t) => ({
        id: t.id,
        tool: t.tool,
        parentOperation: t.metadata?.parentOperation,
      })),
    });
    return false;
  }

  // Rule 3: No MCP calls in code (side effects)
  for (const task of tasks) {
    if (task.code?.includes("mcp.")) {
      return false;
    }
  }

  // Single task passes basic checks - can be part of a fusion
  if (tasks.length === 1) return true;

  // Rule 4: All must be pure operations (Phase 2a: checked via metadata)
  // For multi-task fusion, we require explicit pure marking
  if (!tasks.every((t) => t.metadata?.pure === true)) {
    return false;
  }

  // Rule 5: Same permission set
  const permSets = tasks.map((t) => t.sandboxConfig?.permissionSet ?? "minimal");
  if (new Set(permSets).size > 1) {
    return false;
  }

  // Rule 6: Multi-task fusion requires method chain continuity (chainedFrom).
  // Tasks connected via variable-based sequence edges (e.g.,
  //   const filtered = nums.filter(...); const doubled = filtered.map(...)
  // ) CANNOT be fused because their code references source-level variables
  // that don't exist in the fused execution context.
  // Phase 2b+ will add smart variable substitution to support this.
  // Method chains (filter().map()) are safe because the final executable node
  // already has the complete chain code — they never reach here with length > 1.
  for (let i = 1; i < tasks.length; i++) {
    if (!tasks[i].metadata?.chainedFrom) {
      log.debug("Cannot fuse: task not part of method chain (variable-based sequence)", {
        taskId: tasks[i].id,
        tool: tasks[i].tool,
      });
      return false;
    }
  }

  return true;
}

/**
 * Fuse multiple tasks into a single physical task
 *
 * Generates fused code by combining all task codes sequentially.
 * Uses the original extracted code from SWC spans.
 */
export function fuseTasks(tasks: Task[]): Task {
  if (tasks.length === 0) {
    throw new Error("Cannot fuse empty task list");
  }

  if (tasks.length === 1) {
    return tasks[0];
  }

  log.debug("Fusing tasks", {
    taskIds: tasks.map((t) => t.id),
    operations: tasks.map((t) => t.tool),
  });

  // Collect external dependencies (dependencies outside the fused group)
  const taskIds = new Set(tasks.map((t) => t.id));
  const externalDeps = new Set<string>();

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        externalDeps.add(dep);
      }
    }
  }

  // Generate fused code
  const fusedCode = generateFusedCode(tasks);

  log.debug("Generated fused code", { codeLength: fusedCode.length });

  // Merge literal bindings from all tasks (Story 10.2c fix)
  const mergedLiteralBindings: Record<string, unknown> = {};
  for (const task of tasks) {
    if (task.literalBindings) {
      Object.assign(mergedLiteralBindings, task.literalBindings);
    }
  }

  // Create fused task
  const fusedTask: Task = {
    id: `fused_${tasks[0].id}`,
    type: "code_execution",
    tool: "code:computation", // Generic pseudo-tool for fused tasks
    code: fusedCode,
    arguments: {},
    dependsOn: Array.from(externalDeps),
    sandboxConfig: tasks[0].sandboxConfig,
    metadata: {
      fusedFrom: tasks.map((t) => t.id),
      logicalTools: tasks.map((t) => t.tool!),
      pure: true,
    },
    // Preserve variable bindings from first task (for MCP dependencies)
    variableBindings: tasks[0].variableBindings,
    // Merge literal bindings from all fused tasks (Story 10.2c fix)
    literalBindings: Object.keys(mergedLiteralBindings).length > 0
      ? mergedLiteralBindings
      : undefined,
  };

  return fusedTask;
}

/**
 * Generate fused code from multiple tasks
 *
 * Phase 2a (simple): Concatenate code blocks
 * Phase 2b+ (advanced): Smart variable renaming, deps.task_X.output substitution
 */
function generateFusedCode(tasks: Task[]): string {
  const codeBlocks: string[] = [];

  for (const task of tasks) {
    if (!task.code) {
      log.warn("Task missing code, skipping in fusion", { taskId: task.id });
      continue;
    }

    // For now, just use the original code as-is
    // Phase 2b+ will add smart variable substitution
    codeBlocks.push(task.code);
  }

  // Join with semicolons + newlines to ensure each statement terminates properly
  // Without semicolons, consecutive expressions like:
  //   nums.filter(n => n > 5)
  //   filtered.map(n => n * 2)
  // are parsed as a single expression, causing "Unexpected identifier" errors.
  const fusedCode = codeBlocks.map((b) => b.replace(/;?\s*$/, ";")).join("\n");

  // Wrap in function that returns the last expression result
  return `
// Fused code from ${tasks.length} operations
${fusedCode}
`.trim();
}
