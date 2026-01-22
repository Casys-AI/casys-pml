/**
 * ExecutionCaptureService
 *
 * Captures successful executions as capabilities (workflow_pattern + pml_registry).
 *
 * Factorized from workflow-execution-handler.ts:685-779 to be reusable by:
 * - HIL flow (after per-layer validation completes)
 * - Client-routed flow (after client sends execution trace)
 *
 * @module application/services/execution-capture
 */

import * as log from "@std/log";
import type { LearningContext } from "../../cache/types.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../../capabilities/capability-registry.ts";
import type { TraceTaskResult } from "../../capabilities/types/mod.ts";
import type { IDAGConverter, OptimizedDAG } from "../../infrastructure/di/adapters/execute/dag-converter-adapter.ts";
import type { TaskResult } from "../../dag/types.ts";
import { getUserScope } from "../../lib/user.ts";

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Input for capturing an execution as a capability
 */
export interface ExecutionCaptureInput {
  /** Learning context with code, intent, staticStructure */
  learningContext: LearningContext;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Task results from execution */
  taskResults: TraceTaskResult[];
  /** User ID for multi-tenant isolation (overrides learningContext.userId) */
  userId?: string;
}

/**
 * Dependencies for ExecutionCaptureService
 */
export interface ExecutionCaptureDeps {
  /** Capability store for saving to workflow_pattern */
  capabilityStore: CapabilityStore;
  /** Optional registry for creating FQDN in pml_registry */
  capabilityRegistry?: CapabilityRegistry;
  /** DAG converter for building complete executedPath from staticStructure */
  dagConverter?: IDAGConverter;
}

/**
 * Result of capturing an execution
 */
export interface ExecutionCaptureResult {
  /** Created/updated capability */
  capability: {
    id: string;
    codeHash: string;
  };
  /** FQDN if registered in pml_registry */
  fqdn?: string;
  /** True if newly created, false if already existed (via hash) */
  created: boolean;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * ExecutionCaptureService
 *
 * Captures successful code executions as reusable capabilities.
 *
 * Two-step process:
 * 1. Save to workflow_pattern (UPSERT via code hash)
 * 2. Register in pml_registry if not already registered
 */
export class ExecutionCaptureService {
  constructor(private readonly deps: ExecutionCaptureDeps) {}

  /**
   * Capture an execution as a capability
   *
   * @param input - Execution data to capture
   * @returns Capture result or null if capture failed
   */
  async capture(input: ExecutionCaptureInput): Promise<ExecutionCaptureResult | null> {
    const { learningContext: ctx, durationMs, taskResults, userId } = input;
    // Note: "local" is not a valid UUID, treat as undefined for DB storage
    const rawUserId = userId ?? ctx.userId;
    const effectiveUserId = rawUserId && rawUserId !== "local" ? rawUserId : undefined;

    // Build executedPath via DAG pipeline (required for complete trace)
    if (!ctx.staticStructure) {
      log.error("[ExecutionCaptureService] Missing staticStructure - cannot build complete trace, skipping capability creation", {
        intent: ctx.intent.substring(0, 50),
      });
      return null;
    }

    if (!this.deps.dagConverter) {
      log.error("[ExecutionCaptureService] Missing dagConverter dependency - cannot build complete trace, skipping capability creation", {
        intent: ctx.intent.substring(0, 50),
      });
      return null;
    }

    let executedPath: string[];
    try {
      const logicalDAG = this.deps.dagConverter.staticStructureToDag(ctx.staticStructure);
      const optimizedDAG = this.deps.dagConverter.optimizeDAG(logicalDAG);
      const physicalResults = this.mapClientResultsToPhysical(taskResults, optimizedDAG);
      const logicalTrace = this.deps.dagConverter.generateLogicalTrace(optimizedDAG, physicalResults);
      executedPath = logicalTrace.executedPath;
    } catch (pipelineError) {
      log.error("[ExecutionCaptureService] Pipeline failed, skipping capability creation", {
        error: pipelineError instanceof Error ? pipelineError.message : String(pipelineError),
        intent: ctx.intent.substring(0, 50),
      });
      return null;
    }

    try {
      const toolsUsed = ctx.toolsUsed ?? executedPath;

      // 1. Save to workflow_pattern (UPSERT via code hash)
      const { capability } = await this.deps.capabilityStore.saveCapability({
        code: ctx.code,
        intent: ctx.intent,
        durationMs: Math.round(durationMs),
        success: true,
        toolsUsed,
        traceData: {
          executedPath,
          taskResults,
          decisions: [],
          initialContext: { intent: ctx.intent },
          intentEmbedding: ctx.intentEmbedding,
          userId: effectiveUserId,
        },
        staticStructure: ctx.staticStructure,
      });

      log.debug("[ExecutionCaptureService] Capability saved to workflow_pattern", {
        capabilityId: capability.id,
        codeHash: capability.codeHash,
        toolsUsed,
      });

      let fqdn: string | undefined;
      let created = true;

      // 2. Register in pml_registry if not already registered
      if (this.deps.capabilityRegistry) {
        const scope = await getUserScope(effectiveUserId ?? null);
        const codeHash = capability.codeHash;

        // Check if already registered (by code hash within scope)
        const existingRecord = await this.deps.capabilityRegistry.getByCodeHash(
          codeHash,
          scope,
        );

        if (!existingRecord) {
          // Infer namespace from first tool (e.g., "std:echo" -> "std")
          const firstTool = toolsUsed[0] ?? "misc";
          const namespace = firstTool.includes(":") ? firstTool.split(":")[0] : "code";
          const action = `exec_${codeHash.substring(0, 8)}`;
          const hash = codeHash.substring(0, 4);

          const record = await this.deps.capabilityRegistry.create({
            org: scope.org,
            project: scope.project,
            namespace,
            action,
            workflowPatternId: capability.id,
            hash,
            userId: effectiveUserId,
            toolsUsed,
          });

          fqdn = record.id;

          log.info("[ExecutionCaptureService] Capability registered in pml_registry", {
            fqdn,
            namespace,
            action,
          });
        } else {
          fqdn = existingRecord.id;
          created = false;

          log.debug("[ExecutionCaptureService] Capability already registered", {
            fqdn: existingRecord.id,
          });
        }
      }

      return {
        capability: {
          id: capability.id,
          codeHash: capability.codeHash,
        },
        fqdn,
        created,
      };
    } catch (error) {
      log.error("[ExecutionCaptureService] Failed to capture execution", {
        intent: ctx.intent.substring(0, 50),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Map client task results to physical DAG task results
   *
   * Client taskIds (t1, t2, t3...) don't match DAG taskIds, so we match by tool name.
   * If the same tool is called multiple times, matches are made in order of appearance.
   *
   * @param taskResults - Task results from client execution
   * @param optimizedDAG - Optimized DAG with physical tasks
   * @returns Map of physical taskId → TaskResult
   */
  private mapClientResultsToPhysical(
    taskResults: TraceTaskResult[],
    optimizedDAG: OptimizedDAG,
  ): Map<string, TaskResult> {
    const physicalResults = new Map<string, TaskResult>();
    const usedPhysicalIds = new Set<string>();

    // Get physical MCP tasks (code:* tasks are non-executable, handled by trace-generator)
    const physicalMcpTasks = (optimizedDAG.tasks as Array<{ id: string; type?: string; tool?: string }>)
      .filter((t) => t.type === "mcp_tool");

    // Match by tool name in order
    for (const clientResult of taskResults) {
      const physicalTask = physicalMcpTasks.find(
        (t) => t.tool === clientResult.tool && !usedPhysicalIds.has(t.id),
      );

      if (physicalTask) {
        usedPhysicalIds.add(physicalTask.id);
        physicalResults.set(physicalTask.id, {
          taskId: physicalTask.id,
          status: clientResult.success ? "success" : "error",
          output: clientResult.result,
          executionTimeMs: clientResult.durationMs,
        });
      } else {
        log.warn("[ExecutionCaptureService] No matching physical task for client result", {
          tool: clientResult.tool,
          clientTaskId: clientResult.taskId,
        });
      }
    }

    log.debug("[ExecutionCaptureService] Mapped client results to physical", {
      clientResultCount: taskResults.length,
      physicalResultCount: physicalResults.size,
    });

    return physicalResults;
  }
}
