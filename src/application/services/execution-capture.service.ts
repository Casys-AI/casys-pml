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
import { getFusionMetadata } from "../../dag/trace-generator.ts";
import { getUserScope, resolveToolFqdn, type UserScope } from "../../lib/user.ts";
import { eventBus } from "../../events/event-bus.ts";
import { getToolDisplayName } from "../../capabilities/tool-id-utils.ts";

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
 * MCP Registry interface for tool FQDN lookup
 */
export interface IMcpRegistry {
  /** Get MCP tool by FQDN without hash (e.g., "pml.mcp.std.fs_list") */
  getByFqdnWithoutHash(fqdnWithoutHash: string): Promise<{ fqdn: string } | null>;
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
  /** MCP Registry for tool FQDN lookup (Issue 6 fix) */
  mcpRegistry?: IMcpRegistry;
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
      // Use getToolDisplayName to convert client FQDN to short format for matching with DAG tasks
      const physicalResults = this.mapClientResultsToPhysical(taskResults, optimizedDAG);
      const logicalTrace = this.deps.dagConverter.generateLogicalTrace(optimizedDAG, physicalResults);
      executedPath = logicalTrace.executedPath;

      // Enrich taskResults with fusion metadata (isFused, logicalOperations)
      this.enrichTaskResultsWithFusion(taskResults, physicalResults, optimizedDAG);
    } catch (pipelineError) {
      log.error("[ExecutionCaptureService] Pipeline failed, skipping capability creation", {
        error: pipelineError instanceof Error ? pipelineError.message : String(pipelineError),
        intent: ctx.intent.substring(0, 50),
      });
      return null;
    }

    try {
      // toolsUsed for DB storage: use FQDNs from ctx.toolsUsed or resolve from executedPath
      const toolsUsed = ctx.toolsUsed && ctx.toolsUsed.length > 0
        ? ctx.toolsUsed  // Already FQDNs
        : await this.resolveToolsToFqdns(executedPath, await getUserScope(effectiveUserId ?? null));

      // 1. Save to workflow_pattern (UPSERT via code hash)
      // Skip zone events - we'll emit them AFTER registry.create() to avoid race condition
      const { capability } = await this.deps.capabilityStore.saveCapability({
        code: ctx.code,
        intent: ctx.intent,
        durationMs: Math.round(durationMs),
        success: true,
        toolsUsed,
        traceData: {
          id: ctx.traceId, // Pre-generated trace ID for hierarchy (ADR-041)
          parentTraceId: ctx.parentTraceId, // Parent trace for nested execution (ADR-041)
          executedPath,
          taskResults,
          decisions: [],
          initialContext: { intent: ctx.intent },
          intentEmbedding: ctx.intentEmbedding,
          userId: effectiveUserId,
        },
        staticStructure: ctx.staticStructure,
        skipZoneEvents: true, // Emit after registry.create() to avoid SSE race condition
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

      // 3. Emit zone events AFTER registry.create() to ensure capability_record exists
      // This fixes the race condition where SSE event triggered hypergraph fetch before DB record
      const capabilityLabel = this.generateCapabilityName(ctx.intent);
      const zonePayload = {
        capabilityId: capability.id,
        label: capabilityLabel,
        toolIds: toolsUsed,
        successRate: capability.successRate,
        usageCount: capability.usageCount,
      };

      if (created) {
        log.info("[ExecutionCaptureService][SSE] Emitting capability.zone.created (post-registry)", {
          capabilityId: zonePayload.capabilityId,
          label: zonePayload.label,
          toolCount: zonePayload.toolIds.length,
        });
        eventBus.emit({
          type: "capability.zone.created",
          source: "execution-capture-service",
          payload: zonePayload,
        });
      } else {
        eventBus.emit({
          type: "capability.zone.updated",
          source: "execution-capture-service",
          payload: zonePayload,
        });
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
   * Uses getToolDisplayName to convert client FQDN to short format for matching.
   *
   * @param taskResults - Task results from client execution (tools in FQDN format)
   * @param optimizedDAG - Optimized DAG with physical tasks (tools in short format)
   * @returns Map of physical taskId → TaskResult
   */
  private mapClientResultsToPhysical(
    taskResults: TraceTaskResult[],
    optimizedDAG: OptimizedDAG,
  ): Map<string, TaskResult> {
    const physicalResults = new Map<string, TaskResult>();
    const usedPhysicalIds = new Set<string>();

    // Cast tasks for easier access to metadata
    type PhysicalTask = {
      id: string;
      type?: string;
      tool?: string;
      metadata?: { logicalTools?: string[]; fusedFrom?: string[] };
    };
    const allPhysicalTasks = optimizedDAG.tasks as PhysicalTask[];

    // DEBUG: Log physical tasks to understand structure
    log.info("[ExecutionCaptureService] DEBUG physical tasks", {
      count: allPhysicalTasks.length,
      tasks: allPhysicalTasks.map((t) => ({
        id: t.id,
        tool: t.tool,
        type: t.type,
        hasMetadata: !!t.metadata,
        logicalTools: t.metadata?.logicalTools,
      })),
    });

    // DEBUG: Log client results (with normalized short format for debugging)
    log.info("[ExecutionCaptureService] DEBUG client results", {
      count: taskResults.length,
      results: taskResults.map((r) => ({
        tool: r.tool,
        toolShort: getToolDisplayName(r.tool),
        taskId: r.taskId,
      })),
    });

    // Match by tool name in order
    // Client uses FQDN, DAG uses short format - convert client FQDN to short format
    for (const clientResult of taskResults) {
      // Convert client FQDN to short format (namespace:action) for matching with DAG tasks
      const clientToolShort = getToolDisplayName(clientResult.tool);

      // First try: match via short format
      let physicalTask = allPhysicalTasks.find((t) => {
        if (!t.tool || usedPhysicalIds.has(t.id)) return false;
        return t.tool === clientToolShort;
      });

      // Second try: fused task match (client reports last logical tool, fused task has "code:computation")
      if (!physicalTask) {
        physicalTask = allPhysicalTasks.find((t) => {
          if (usedPhysicalIds.has(t.id)) return false;
          if (t.tool !== "code:computation") return false;
          // Fused task: check if client result's tool matches the last logical tool
          const logicalTools = t.metadata?.logicalTools || [];
          if (logicalTools.length === 0) return false;
          const lastTool = logicalTools[logicalTools.length - 1];
          return lastTool === clientToolShort;
        });
      }

      if (physicalTask) {
        usedPhysicalIds.add(physicalTask.id);
        physicalResults.set(physicalTask.id, {
          taskId: physicalTask.id,
          status: clientResult.success ? "success" : "error",
          output: clientResult.result,
          executionTimeMs: clientResult.durationMs,
        });

        if (physicalTask.metadata?.fusedFrom) {
          log.debug("[ExecutionCaptureService] Matched fused task", {
            physicalId: physicalTask.id,
            clientTool: clientResult.tool,
            logicalTools: physicalTask.metadata.logicalTools,
          });
        }
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

  /**
   * Enrich task results with fusion metadata from optimized DAG
   *
   * Uses getFusionMetadata() to determine which physical tasks are fusions
   * of multiple logical operations. Mutates taskResults in place.
   *
   * @param taskResults - Original task results (will be mutated)
   * @param physicalResults - Map of physical taskId → TaskResult
   * @param optimizedDAG - Optimized DAG with physicalToLogical mapping
   */
  private enrichTaskResultsWithFusion(
    taskResults: TraceTaskResult[],
    physicalResults: Map<string, TaskResult>,
    optimizedDAG: OptimizedDAG,
  ): void {
    // Build reverse map: tool name → client taskResult indices (for matching)
    const toolToClientIndices = new Map<string, number[]>();
    taskResults.forEach((t, idx) => {
      const indices = toolToClientIndices.get(t.tool) || [];
      indices.push(idx);
      toolToClientIndices.set(t.tool, indices);
    });

    // Track which client indices have been used
    const usedClientIndices = new Set<number>();

    // Cast for metadata access
    type PhysicalTask = {
      id: string;
      tool?: string;
      metadata?: { logicalTools?: string[] };
    };

    // Enrich each physical result
    for (const [physicalId] of physicalResults) {
      // Find the physical task to get its tool name
      const physicalTask = (optimizedDAG.tasks as PhysicalTask[])
        .find((t) => t.id === physicalId);

      if (!physicalTask?.tool) continue;

      // For fused tasks (tool = "code:computation"), use the last logical tool for matching
      let matchTool = physicalTask.tool;
      if (physicalTask.tool === "code:computation" && physicalTask.metadata?.logicalTools?.length) {
        matchTool = physicalTask.metadata.logicalTools[physicalTask.metadata.logicalTools.length - 1];
      }

      // Find matching client taskResult (first unused one with same tool)
      const candidateIndices = toolToClientIndices.get(matchTool) || [];
      const clientIdx = candidateIndices.find((idx) => !usedClientIndices.has(idx));

      if (clientIdx === undefined) continue;
      usedClientIndices.add(clientIdx);

      const clientResult = taskResults[clientIdx];

      // Get fusion metadata using the shared helper
      const fusionMeta = getFusionMetadata(
        physicalId,
        clientResult.durationMs,
        optimizedDAG,
      );

      if (fusionMeta.isFused) {
        clientResult.isFused = true;
        clientResult.logicalOperations = fusionMeta.logicalOperations;

        log.debug("[ExecutionCaptureService] Enriched fused task", {
          physicalId,
          logicalOpsCount: fusionMeta.logicalOperations?.length,
          tools: fusionMeta.logicalOperations?.map((op) => op.toolId),
        });
      }
    }
  }

  /**
   * Generate a human-readable name from intent
   * Takes first 3-5 words and capitalizes first letter
   */
  private generateCapabilityName(intent: string): string {
    const words = intent.split(/\s+/).slice(0, 5);
    const name = words.join(" ");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Resolve tool IDs to FQDNs for hierarchical trace matching (Issue 6 fix).
   *
   * When capability A calls capability B, A's trace needs FQDNs so the server
   * can match parent executed_path entries with child capability_id (UUID).
   *
   * @param toolIds - Array of tool IDs (namespace:action format)
   * @param scope - User scope for FQDN resolution
   * @returns Array of FQDNs (or original ID if resolution fails)
   */
  private async resolveToolsToFqdns(
    toolIds: string[],
    scope: UserScope,
  ): Promise<string[]> {
    const resolvedTools = await Promise.all(
      toolIds.map(async (toolId) => {
        try {
          // Skip code:* pseudo-tools (filter, map, split, etc.)
          if (toolId.startsWith("code:")) {
            return toolId;
          }

          const fqdn = await resolveToolFqdn(toolId, scope, {
            lookupCapability: this.deps.capabilityRegistry?.resolveByName
              ? async (id, s) => await this.deps.capabilityRegistry!.resolveByName(id, s)
              : undefined,
            lookupMcpTool: this.deps.mcpRegistry
              ? async (fqdnWithoutHash) => await this.deps.mcpRegistry!.getByFqdnWithoutHash(fqdnWithoutHash)
              : undefined,
          });

          return fqdn;
        } catch (error) {
          // If resolution fails, keep original ID (fallback)
          log.debug(`[ExecutionCaptureService] Failed to resolve ${toolId} to FQDN: ${error}`);
          return toolId;
        }
      }),
    );

    return resolvedTools;
  }
}
